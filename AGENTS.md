# AGENTS.md — documentation-mcp Provider Laws

This file documents the laws and conventions for contributing providers
to the `documentation-mcp` project. Every provider and every core change
**must** follow these rules.

---

## 1. Provider Contract

Every provider is a default-exported object implementing the `Provider`
interface defined in `src/core/provider.ts`. The required members are:

| Member              | Type                                  | Purpose                                        |
| ------------------- | ------------------------------------- | ---------------------------------------------- |
| `id`                | `string`                              | Unique slug — used as tool prefix and cache dir |
| `name`              | `string`                              | Human-readable display name                    |
| `baseUrl`           | `string`                              | Root URL of the documentation site             |
| `sections`          | `ProviderSection[]`                   | Navigable sections to crawl and index          |
| `extraction`        | `ExtractionConfig`                    | CSS selector + base URL for extraction         |
| `resolveTarget()`   | `(target: string) => string \| null`  | Shorthand → full URL resolver                  |
| `classifyPage()`    | `(url: string) => string`            | URL → kind label for search index              |
| `ownsUrl()`         | `(url: string) => boolean`           | Does this URL belong to the provider?          |
| `discoverUrls()`    | `(section?: string) => Promise<string[]>` | Discover all scrapable URLs              |
| `registerTools()`   | `(server, services) => void`         | Register MCP tools on the server               |
| `registerPrompts()` | `(server) => void`                   | Register MCP prompts on the server             |

Optional:
- `transformMarkdown?(markdown: string): string` — post-processing hook

## 2. Naming Conventions

- **Provider ID**: lowercase, no hyphens, no underscores (e.g. `fabricjs`, `fastapi`, `zustand`)
- **Tool names**: `{providerId}_{toolName}` — always prefixed with the provider ID
- **Prompt names**: `{providerId}_{promptName}`
- **Config file**: `{providerId}.config.ts`
- **Tools file**: `{providerId}.tools.ts`
- **Prompts file**: `{providerId}.prompts.ts`
- **Entry point**: `index.ts` (default export)

## 3. File Structure

```
src/providers/{id}/
  ├── index.ts              # Default-exports Provider instance (required)
  ├── {id}.config.ts        # Sections, extraction config, constants
  ├── {id}.tools.ts         # Custom tools beyond the generic factories
  └── {id}.prompts.ts       # AI assistant prompts and quickstart guides
```

All imports from core use `../../core/` relative paths with `.js` extensions.
All imports from infrastructure use `../../infrastructure/` relative paths.

## 4. Tool Registration Rules

Every provider **must** register these generic tools via the factories
in `src/core/tool-factories.ts`:

1. `createSearchTool` — cross-section search
2. `createSectionSearchTool` — one per section
3. `createListIndexTool` — browse cached pages
4. `createReindexTool` — crawl and rebuild index
5. `createCacheStatusTool` — cache health check

Register custom tools **after** the generic ones. Custom tool `execute`
handlers must return a string (never throw for user-facing errors).

## 5. Discovery Contract

`discoverUrls()` must:
- Accept an optional `section` parameter to filter by section
- Return an array of fully-qualified URLs
- Handle network failures gracefully (catch, log, return partial results)
- Deduplicate URLs
- Normalize trailing slashes consistently

## 6. Scraping Contract

Providers do **not** call scrapers directly — they supply configuration
and the framework does the rest:

- `extraction.contentSelector` — CSS selector for the main content element
- `extraction.baseUrl` — base URL for resolving relative links
- `extraction.detectSection` — maps a page URL to its section name
- `transformMarkdown()` — optional post-extraction cleanup

## 7. Prompts

Every provider should register at least:
- An **assistant** prompt setting the AI persona and tool-use rules
- A **quickstart** prompt walking through first-time setup

Prompts are registered in `registerPrompts()` using `server.addPrompt()`.

## 8. Cache Isolation

Each provider gets its own subdirectory under the cache root:
`{CACHE_DIR}/{providerId}/`. Never write to another provider's cache.
The framework creates the directory at startup.

## 9. Shared Infrastructure — Do Not Duplicate

The following services are shared and must not be reimplemented:
- `CacheService` — filesystem cache with TTL
- `ScraperService` — fetch → extract → transform pipeline
- `SearchService` — TF-IDF search index over cached pages
- `BrowserService` — Playwright singleton
- `httpFetchPage` / `httpDiscoverUrls` — HTTP fetching utilities

## 10. Code Style

- TypeScript strict mode, ES2023 target
- All imports use `.js` extensions (Node16 module resolution)
- Use `node:` prefix for Node.js built-ins (e.g. `node:fs/promises`)
- No default exports except the provider entry point
- Zod for tool parameter schemas
- Structured JSON logging via `logger` from `core/logger.js`

## 11. Testing Checklist

Before submitting a new provider, verify:

- [ ] `pnpm typecheck` passes with zero errors
- [ ] Provider is auto-discovered at startup (check logs)
- [ ] All 5 generic tools appear in tool list
- [ ] `{id}_reindex` successfully crawls and caches pages
- [ ] `{id}_search` returns relevant results
- [ ] `{id}_cache_status` shows correct stats
- [ ] Custom tools return strings (no thrown errors for bad input)
- [ ] Docker build succeeds

## 12. Minimal Provider Template

```ts
// src/providers/mylib/index.ts
import type { FastMCP } from 'fastmcp'
import type { Provider, ProviderServices } from '../../core/provider.js'
import {
  createSearchTool,
  createListIndexTool,
  createReindexTool,
  createCacheStatusTool,
} from '../../core/tool-factories.js'

const provider: Provider = {
  id: 'mylib',
  name: 'MyLib',
  baseUrl: 'https://mylib.dev',
  sections: [
    { name: 'docs', indexUrl: 'https://mylib.dev/docs/', urlPrefix: 'docs' },
  ],
  extraction: {
    contentSelector: 'main',
    baseUrl: 'https://mylib.dev',
    detectSection: () => 'docs',
  },

  resolveTarget: () => null,
  classifyPage: () => 'page',
  ownsUrl: (url) => url.includes('mylib.dev'),

  async discoverUrls(section) {
    const { httpDiscoverUrls } = await import(
      '../../infrastructure/scraper/http.service.js'
    )
    const sections = section
      ? this.sections.filter((s) => s.name === section)
      : this.sections
    const urls: string[] = []
    for (const s of sections) {
      const found = await httpDiscoverUrls(s.indexUrl, s.urlPrefix, this.baseUrl)
      urls.push(...found)
    }
    return [...new Set(urls)]
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
