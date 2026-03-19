# fabric-mcp

MCP server that scrapes, caches, and serves Fabric.js documentation from [fabricjs.com](https://fabricjs.com) via Model Context Protocol tools.

## Architecture

```
Cursor / VS Code
      │  MCP Streamable HTTP  (http://localhost:3000/mcp)
      ▼
Traefik :3000  (+ dashboard :8080)
      │
      ▼
fabric-mcp container (Node.js + FastMCP)
      │
      ├── features/scraper   ← Playwright 3-stage pipeline
      ├── features/cache     ← Bolt-style FS store (/data/cache/xx/yy/<hash>.json)
      ├── features/search    ← In-memory TF×IDF index built from cache
      ├── features/api       ← MCP tools for fabricjs.com/api/
      └── features/docs      ← MCP tools for fabricjs.com/docs/

Docker volumes:
  mcp-cache    → /data/cache  (persists scraped pages between restarts)
  traefik-logs → /logs
```

## Scraper Pipeline

| Stage        | File                        | Input → Output                                                                     |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| 1. Fetch     | `stages/fetch.stage.ts`     | `url: string` → `RawPage { url, html, fetchedAt }`                                 |
| 2. Extract   | `stages/extract.stage.ts`   | `RawPage` → `ExtractedPage { url, title, section, markdown, headings, fetchedAt }` |
| 3. Transform | `stages/transform.stage.ts` | `ExtractedPage` → `PageRecord { ...ExtractedPage, hash }`                          |

## Cache Layout

The cache uses a bolt-style filesystem store. The SHA-256 hash of the URL is split into a 2-level directory prefix:

```
/data/cache/
  a3/
    f9/
      <remaining 60 hex chars>.json
```

Each `.json` file is a self-describing `CacheEntry<PageRecord>` with embedded TTL — no external expiry index needed.

## Quick Start

```bash
docker compose up --build -d
```

The MCP server is available at `http://localhost:3000/mcp`. The Traefik dashboard is at `http://localhost:8080`.

### Cursor Connection

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "fabricjs": {
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### VS Code Connection

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "fabricjs": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### First-Time Setup

After starting the server, use the `fabricjs_quickstart` prompt or manually:

1. Call `fabricjs_cache_status` to check the cache
2. Call `fabricjs_reindex` with `section="all"` to crawl and cache all docs
3. Call `fabricjs_list_index` to browse available pages

## MCP Tools

| Tool                    | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `fabricjs_search`       | Entry point — searches both API and docs simultaneously |
| `fabricjs_get_api_page` | Fetch full TypeDoc API reference for a class/interface  |
| `fabricjs_get_guide`    | Fetch a guide/tutorial page from /docs/                 |
| `fabricjs_search_api`   | Search only the API reference section                   |
| `fabricjs_search_docs`  | Search only guides and tutorials                        |
| `fabricjs_list_index`   | Browse all cached pages grouped by kind                 |
| `fabricjs_reindex`      | Crawl fabricjs.com and rebuild cache + search index     |
| `fabricjs_cache_status` | Show cache health and index stats                       |

## MCP Prompts

| Prompt                | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `fabricjs_assistant`  | Activates Fabric.js expert mode with mandatory tool-use rules |
| `fabricjs_quickstart` | Walks through first-time setup step by step                   |

## Environment Variables

| Variable              | Default        | Description                             |
| --------------------- | -------------- | --------------------------------------- |
| `MCP_PORT`            | `3000`         | FastMCP Streamable HTTP port            |
| `CACHE_DIR`           | `./data/cache` | Root of bolt-style FS cache             |
| `CACHE_TTL_SECONDS`   | `86400`        | Cache entry TTL in seconds (24h)        |
| `SCRAPER_CONCURRENCY` | `3`            | Max parallel Playwright pages in batch  |
| `SCRAPER_DELAY_MS`    | `250`          | Delay between batches (polite crawling) |
| `SCRAPER_TIMEOUT_MS`  | `15000`        | Playwright page load timeout            |

## Development

```bash
# Install dependencies
npm install

# Install Chromium for Playwright
npx playwright install chromium

# Start in watch mode
npm run dev

# Type check
npm run typecheck

# Build
npm run build

# Start production
npm start
```
