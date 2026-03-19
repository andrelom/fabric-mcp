# documentation-mcp

A generic, multi-provider MCP server that scrapes, caches, and serves documentation from any site via [Model Context Protocol](https://modelcontextprotocol.io) tools.

Out of the box it ships with a **Fabric.js** provider — but adding support for FastAPI, SQLAlchemy, Zustand, or any other library is as simple as creating a new folder under `src/providers/`.

## Architecture

```
Cursor / VS Code
      │  MCP Streamable HTTP  (http://localhost:3000/mcp)
      ▼
Traefik :3000  (+ dashboard :8080)
      │
      ▼
documentation-mcp container (Node.js + FastMCP)
      │
      ├── core/               ← Provider interface, tool factories, registry
      ├── infrastructure/     ← Generic scraper, cache, search services
      └── providers/
            └── fabricjs/     ← Fabric.js-specific config, tools & prompts
            └── <yours>/      ← Add new providers here

Docker volumes:
  mcp-cache    → /data/cache/{providerId}/  (isolated per provider)
  traefik-logs → /logs
```

### Provider System

Each provider supplies:

| Concern             | What the provider defines                                      |
| ------------------- | -------------------------------------------------------------- |
| **Identity**        | `id`, `name`, `baseUrl`                                        |
| **Sections**        | URL prefixes to crawl (e.g. `/api/`, `/docs/`)                 |
| **Extraction**      | CSS selector for main content, relative link resolution        |
| **Classification**  | How to map a URL to a page kind (`class`, `guide`, etc.)       |
| **Discovery**       | How to find all scrapable URLs on the site                     |
| **Markdown tweaks** | Optional post-processing hook (e.g. strip TypeDoc backlinks)   |
| **Custom tools**    | Provider-specific MCP tools beyond the generic factories       |
| **Prompts**         | AI assistant instructions and quickstart guides                |

The framework auto-discovers providers at startup and wires each one to its own scoped cache, scraper, and search index.

## Scraper Pipeline

| Stage        | File                        | Input → Output                                                                     |
| ------------ | --------------------------- | ---------------------------------------------------------------------------------- |
| 1. Fetch     | `stages/fetch.stage.ts`     | `url: string` → `RawPage { url, html, fetchedAt }`                                 |
| 2. Extract   | `stages/extract.stage.ts`   | `RawPage` → `ExtractedPage { url, title, section, markdown, headings, fetchedAt }` |
| 3. Transform | `stages/transform.stage.ts` | `ExtractedPage` → `PageRecord { ...ExtractedPage, hash }`                          |

## Cache Layout

Each provider gets an isolated subdirectory. URLs are SHA-256 hashed and stored in a two-level directory tree:

```
/data/cache/
  fabricjs/
    a3/
      f9/
        <remaining 60 hex chars>.json
  fastapi/
    ...
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
    "docs": {
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
    "docs": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### First-Time Setup (Fabric.js)

After starting the server, use the `fabricjs_quickstart` prompt or manually:

1. Call `fabricjs_cache_status` to check the cache
2. Call `fabricjs_reindex` with `section="all"` to crawl and cache all docs
3. Call `fabricjs_list_index` to browse available pages

## Built-in Provider: Fabric.js

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

| Prompt                | Description                                                   |
| --------------------- | ------------------------------------------------------------- |
| `fabricjs_assistant`  | Activates Fabric.js expert mode with mandatory tool-use rules |
| `fabricjs_quickstart` | Walks through first-time setup step by step                   |

## Adding a New Provider

1. Create a folder: `src/providers/mylib/`
2. Create the provider config (`mylib.config.ts`):

```ts
import type { ProviderSection, ExtractionConfig } from '../../core/provider.js'

export const SECTIONS: ProviderSection[] = [
  { name: 'docs', indexUrl: 'https://mylib.dev/docs/', urlPrefix: 'docs' },
]

export const EXTRACTION: ExtractionConfig = {
  contentSelector: 'main',
  baseUrl: 'https://mylib.dev',
  detectSection: () => 'docs',
}
```

3. Create the provider entry point (`index.ts`):

```ts
import type { Provider, ProviderServices } from '../../core/provider.js'
import type { FastMCP } from 'fastmcp'
import {
  createSearchTool,
  createListIndexTool,
  createReindexTool,
  createCacheStatusTool,
} from '../../core/tool-factories.js'
import { SECTIONS, EXTRACTION } from './mylib.config.js'

const provider: Provider = {
  id: 'mylib',
  name: 'MyLib',
  baseUrl: 'https://mylib.dev',
  sections: SECTIONS,
  extraction: EXTRACTION,

  resolveTarget: () => null,
  classifyPage: () => 'page',
  ownsUrl: (url) => url.includes('mylib.dev'),

  async discoverUrls() {
    // Implement URL discovery for your site
    const { httpDiscoverUrls } = await import(
      '../../infrastructure/scraper/http.service.js'
    )
    return httpDiscoverUrls(SECTIONS[0]!.indexUrl, 'docs', 'https://mylib.dev')
  },

  registerTools(server: FastMCP, services: ProviderServices) {
    createSearchTool(server, this, services)
    createListIndexTool(server, this, services)
    createReindexTool(server, this, services)
    createCacheStatusTool(server, this, services)
  },

  registerPrompts() {},
}

export default provider
```

4. Restart the server — the provider is auto-discovered and its tools are registered.

## Environment Variables

| Variable              | Default        | Description                             |
| --------------------- | -------------- | --------------------------------------- |
| `MCP_PORT`            | `3000`         | FastMCP Streamable HTTP port            |
| `CACHE_DIR`           | `./data/cache` | Root of bolt-style FS cache             |
| `CACHE_TTL_SECONDS`   | `86400`        | Cache entry TTL in seconds (24h)        |
| `SCRAPER_CONCURRENCY` | `3`            | Max parallel page fetches per batch     |
| `SCRAPER_DELAY_MS`    | `250`          | Delay between batches (polite crawling) |
| `SCRAPER_TIMEOUT_MS`  | `15000`        | Page load timeout                       |
| `USE_PLAYWRIGHT`      | `false`        | Use Playwright Chromium instead of HTTP |

## Development

```bash
# Install dependencies
pnpm install

# Install Chromium for Playwright (only if USE_PLAYWRIGHT=true)
pnpm exec playwright install chromium

# Start in watch mode
pnpm dev

# Type check
pnpm typecheck

# Build
pnpm build

# Start production
pnpm start
```

## Project Structure

```
src/
├── core/                         # Framework contracts & shared utilities
│   ├── provider.ts               # Provider interface (the main contract)
│   ├── registry.ts               # Auto-discover providers at startup
│   ├── tool-factories.ts         # Generic MCP tool factories
│   ├── config.ts                 # Shared env config (port, cache, scraper)
│   ├── types.ts                  # Shared TypeScript types
│   ├── logger.ts                 # Structured JSON logging
│   └── hash.ts                   # URL → SHA256 hashing
│
├── infrastructure/               # Generic, reusable services
│   ├── cache/
│   │   └── cache.service.ts      # Provider-scoped filesystem cache
│   ├── scraper/
│   │   ├── scraper.service.ts    # Fetch → extract → transform pipeline
│   │   ├── browser.service.ts    # Shared Playwright singleton
│   │   ├── http.service.ts       # Native fetch + JSDOM
│   │   └── stages/
│   │       ├── fetch.stage.ts    # HTML fetching
│   │       ├── extract.stage.ts  # HTML → Markdown conversion
│   │       └── transform.stage.ts# Markdown cleanup + provider hook
│   └── search/
│       └── search.service.ts     # Provider-scoped in-memory search index
│
├── server/
│   └── index.ts                  # Server entry point
│
├── providers/                    # One folder per documentation source
│   └── fabricjs/
│       ├── index.ts              # FabricJsProvider (implements Provider)
│       ├── fabricjs.config.ts    # URLs, selectors, KNOWN_CLASSES
│       ├── fabricjs.tools.ts     # Custom tools (get_api_page, get_guide)
│       └── fabricjs.prompts.ts   # AI assistant & quickstart prompts
│
└── types/
    └── turndown-plugin-gfm.d.ts  # Type declarations
```
