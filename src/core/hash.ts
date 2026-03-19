import { createHash } from 'node:crypto'
import { join } from 'node:path'

export function urlToHash(url: string): string {
  return createHash('sha256').update(url).digest('hex')
}

export function hashToPath(cacheDir: string, hash: string): string {
  const a = hash.slice(0, 2)
  const b = hash.slice(2, 4)
  const rest = hash.slice(4)
  return join(cacheDir, a, b, `${rest}.json`)
}
