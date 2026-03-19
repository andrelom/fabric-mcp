import { createServer } from 'node:http'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { FastMCP } from 'fastmcp'
import { config } from '../core/config.js'
import { logger } from '../core/logger.js'
import { discoverProviders } from '../core/registry.js'
import { CacheService } from '../infrastructure/cache/cache.service.js'
import { ScraperService } from '../infrastructure/scraper/scraper.service.js'
import { SearchService } from '../infrastructure/search/search.service.js'
import type { ProviderServices } from '../core/provider.js'

const VERSION = '1.0.0'

const server = new FastMCP({
  name: 'documentation-mcp',
  version: VERSION,
})

// --- Provider discovery and registration ---

const providers = await discoverProviders()

if (providers.length === 0) {
  logger.error('no providers found — server has no tools to register')
  process.exit(1)
}

const searchServices: SearchService[] = []

for (const provider of providers) {
  // Each provider gets its own scoped infrastructure
  const cacheDir = join(config.cache.dir, provider.id)
  await mkdir(cacheDir, { recursive: true })
  const cache = new CacheService(cacheDir, config.cache.ttlSeconds)
  const scraper = new ScraperService(provider, cache)
  const search = new SearchService(cache, provider.classifyPage.bind(provider))

  const services: ProviderServices = { cache, scraper, search }

  provider.registerTools(server, services)
  provider.registerPrompts(server)
  searchServices.push(search)

  logger.info('registered provider', { id: provider.id, name: provider.name })
}

logger.info('all providers registered', {
  providers: providers.map((p) => p.id),
  count: providers.length,
})

// --- Health check sidecar on port + 1 ---

const healthPort = config.server.port + 1
const healthServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        status: 'ok',
        version: VERSION,
        providers: providers.map((p) => p.id),
      }),
    )
  } else {
    res.writeHead(404)
    res.end()
  }
})

healthServer.listen(healthPort, () => {
  logger.info('health server started', { port: healthPort })
})

// --- Start MCP server ---

server.start({
  transportType: 'httpStream',
  httpStream: { host: '0.0.0.0', port: config.server.port },
})

logger.info('documentation-mcp started', {
  port: config.server.port,
  healthPort,
  version: VERSION,
  providers: providers.map((p) => p.id),
})

// --- Warm up search indices from existing cache (fire-and-forget) ---

Promise.all(
  searchServices.map((s) => s.buildIndex().catch((err) => {
    logger.warn('initial index build failed', { error: String(err) })
  })),
)

// --- Graceful shutdown ---

const shutdown = async () => {
  logger.info('shutting down')
  if (config.scraper.usePlaywright) {
    const { closeBrowser } = await import('../infrastructure/scraper/browser.service.js')
    await closeBrowser()
  }
  healthServer.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
