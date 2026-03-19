import { chromium, type Browser, type Page } from 'playwright'
import { config } from '../../core/config.js'
import { logger } from '../../core/logger.js'

/**
 * Shared Playwright Chromium singleton.
 *
 * A single browser instance is reused across all providers — it's just
 * Chrome and can open pages from any domain. The instance auto-reconnects
 * if the browser process disconnects.
 */
let browser: Browser | null = null

export async function getBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser

  logger.info('launching chromium')
  browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  })

  browser.on('disconnected', () => {
    logger.warn('browser disconnected, will re-launch on next request')
    browser = null
  })

  return browser
}

export async function openPage(url: string): Promise<Page> {
  const b = await getBrowser()
  const page = await b.newPage()

  await page.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (type === 'image' || type === 'media' || type === 'font') {
      return route.abort()
    }
    return route.continue()
  })

  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: config.scraper.timeoutMs,
  })

  return page
}

export async function closeBrowser(): Promise<void> {
  if (browser && browser.isConnected()) {
    await browser.close()
    logger.info('browser closed')
  }
  browser = null
}
