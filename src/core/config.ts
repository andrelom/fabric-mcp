/**
 * Application-wide configuration parsed from environment variables.
 *
 * Provider-specific settings (URLs, selectors, etc.) live in each
 * provider's own config file — this module only covers shared
 * infrastructure: server port, cache defaults, and scraper tuning.
 */

function envInt(key: string, fallback: number): number {
  const v = process.env[key]
  if (v === undefined) return fallback
  const n = parseInt(v, 10)
  return Number.isNaN(n) ? fallback : n
}

function envStr(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  server: {
    port: envInt('MCP_PORT', 3000),
  },
  cache: {
    dir: envStr('CACHE_DIR', './data/cache'),
    ttlSeconds: envInt('CACHE_TTL_SECONDS', 86400),
  },
  scraper: {
    concurrency: envInt('SCRAPER_CONCURRENCY', 3),
    delayMs: envInt('SCRAPER_DELAY_MS', 250),
    timeoutMs: envInt('SCRAPER_TIMEOUT_MS', 15000),
    usePlaywright: envStr('USE_PLAYWRIGHT', 'false') === 'true',
  },
} as const
