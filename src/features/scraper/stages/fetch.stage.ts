import { openPage } from '../browser.service.js'
import { httpFetchPage } from '../http.service.js'
import { logger } from '../../../shared/logger.js'
import type { RawPage } from '../../../shared/types.js'

export async function fetchStage(url: string): Promise<RawPage> {
  const page = await openPage(url)
  try {
    const html = await page.content()
    logger.debug('fetch complete', { url, length: html.length })
    return { url, html, fetchedAt: Date.now() }
  } finally {
    await page.close()
  }
}

export async function fetchStageHttp(url: string): Promise<RawPage> {
  const html = await httpFetchPage(url)
  logger.debug('http fetch complete', { url, length: html.length })
  return { url, html, fetchedAt: Date.now() }
}
