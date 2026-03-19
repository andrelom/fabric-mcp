import { createServer } from 'node:http'
import { FastMCP } from 'fastmcp'
import { config } from '../shared/config.js'
import { logger } from '../shared/logger.js'
import { closeBrowser } from '../features/scraper/browser.service.js'
import { buildIndex } from '../features/search/search.service.js'
import { registerSearchTools } from '../features/search/search.tools.js'
import { registerApiTools } from '../features/api/api.tools.js'
import { registerDocsTools } from '../features/docs/docs.tools.js'
import { registerPrompts } from './prompts.js'

const VERSION = '1.0.0'

const server = new FastMCP({
  name: 'fabric-mcp',
  version: VERSION,
})

// Register all tools and prompts
registerApiTools(server)
registerDocsTools(server)
registerSearchTools(server)
registerPrompts(server)

// Health check sidecar on port + 1
const healthPort = config.server.port + 1
const healthServer = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', version: VERSION }))
  } else {
    res.writeHead(404)
    res.end()
  }
})

healthServer.listen(healthPort, () => {
  logger.info('health server started', { port: healthPort })
})

// Start MCP server
server.start({
  transportType: 'httpStream',
  httpStream: { port: config.server.port },
})

logger.info('fabric-mcp started', {
  port: config.server.port,
  healthPort,
  version: VERSION,
})

// Warm up search index from existing cache (fire-and-forget)
buildIndex().catch((err) => {
  logger.warn('initial index build failed', { error: String(err) })
})

// Graceful shutdown
const shutdown = async () => {
  logger.info('shutting down')
  await closeBrowser()
  healthServer.close()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
