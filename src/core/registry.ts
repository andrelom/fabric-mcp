import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from './logger.js'
import type { Provider } from './provider.js'

/**
 * Auto-discovers provider modules from `src/providers/`.
 *
 * Each subdirectory must contain an `index.ts` (or compiled `index.js`)
 * that default-exports a {@link Provider} instance. Directories without
 * a valid default export are silently skipped.
 *
 * @returns Array of discovered provider instances, ready for registration.
 */
export async function discoverProviders(): Promise<Provider[]> {
  const currentDir = fileURLToPath(new URL('.', import.meta.url))
  const providersDir = join(currentDir, '..', 'providers')

  let entries: string[]
  try {
    entries = await readdir(providersDir)
  } catch {
    logger.warn('providers directory not found', { path: providersDir })
    return []
  }

  const providers: Provider[] = []
  const seenIds = new Set<string>()

  for (const name of entries) {
    const dirPath = join(providersDir, name)
    const info = await stat(dirPath).catch(() => null)
    if (!info?.isDirectory()) continue

    try {
      const modulePath = join(dirPath, 'index.js')
      const mod = (await import(modulePath)) as { default?: Provider }

      if (!mod.default || !mod.default.id) {
        logger.warn('skipping provider — no valid default export', { dir: name })
        continue
      }

      if (seenIds.has(mod.default.id)) {
        logger.warn('duplicate provider id — skipping', { id: mod.default.id, dir: name })
        continue
      }
      seenIds.add(mod.default.id)

      providers.push(mod.default)
      logger.info('discovered provider', { id: mod.default.id, name: mod.default.name })
    } catch (err) {
      logger.warn('failed to load provider', { dir: name, error: String(err) })
    }
  }

  return providers
}
