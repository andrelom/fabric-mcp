import { urlToHash } from '../../../core/hash.js'
import type { ExtractedPage, PageRecord } from '../../../core/types.js'

function collapseBlankLines(md: string): string {
  return md.replace(/\n{4,}/g, '\n\n\n')
}

/**
 * Applies generic Markdown cleanup and optionally runs a provider-specific
 * transform hook.
 *
 * @param extracted - The extracted page from the extract stage.
 * @param providerTransform - Optional provider hook for custom post-processing.
 */
export function transformStage(
  extracted: ExtractedPage,
  providerTransform?: (markdown: string) => string,
): PageRecord {
  let markdown = extracted.markdown
  markdown = collapseBlankLines(markdown)

  if (providerTransform) {
    markdown = providerTransform(markdown)
  }

  const hash = urlToHash(extracted.url)

  return {
    ...extracted,
    markdown,
    hash,
  }
}
