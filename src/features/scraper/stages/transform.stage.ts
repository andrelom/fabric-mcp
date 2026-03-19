import { urlToHash } from '../../../shared/hash.js'
import type { ExtractedPage, PageRecord } from '../../../shared/types.js'

function removeAnchorLinks(md: string): string {
  // Strip TypeDoc [↩](#xxx) links
  return md.replace(/\[↩\]\(#[^)]*\)/g, '')
}

function tagCodeBlocks(md: string): string {
  // Add typescript language tag to bare fenced code blocks
  return md.replace(/^```\s*$/gm, '```typescript')
}

function collapseBlankLines(md: string): string {
  // Collapse 3+ consecutive blank lines to 2
  return md.replace(/\n{4,}/g, '\n\n\n')
}

export function transformStage(extracted: ExtractedPage): PageRecord {
  let markdown = extracted.markdown
  markdown = removeAnchorLinks(markdown)
  markdown = tagCodeBlocks(markdown)
  markdown = collapseBlankLines(markdown)

  const hash = urlToHash(extracted.url)

  return {
    ...extracted,
    markdown,
    hash,
  }
}
