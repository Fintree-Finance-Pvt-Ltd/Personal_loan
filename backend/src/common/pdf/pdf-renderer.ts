import { Logger } from '@nestjs/common';
// Type-only import: puppeteer itself is loaded lazily, on the first render, so it is not
// pulled in (or parsed) by anything that merely imports this file.
import type { Browser, PDFOptions } from 'puppeteer';

const DEFAULT_MAX_CONCURRENT_PAGES = 3;
const MAX_CONFIGURABLE_PAGES = 20;

/**
 * One shared headless Chromium for every PDF the app renders, with a cap on how many pages
 * are open at once.
 *
 * - One browser is kept alive for the process's lifetime and only a page is opened/closed
 *   per request. A fresh puppeteer.launch() per PDF (a full Chromium cold start) is what
 *   made the first "View Agreement" click per loan slow enough to time out.
 * - Rendering is CPU- and memory-heavy (a page can take a few hundred MB). Without a cap, a
 *   burst of requests opens that many pages at once and can exhaust the server's memory,
 *   taking the whole API down with it. Requests beyond the cap simply wait their turn.
 * - A failed launch is not remembered: the next render tries again, so fixing the Chromium
 *   install does not need a restart.
 *
 * Tune with PDF_MAX_CONCURRENT_PAGES (default 3, max 20).
 */
export class PdfRenderer {
  private readonly logger = new Logger(PdfRenderer.name);
  private browserPromise: Promise<Browser> | null = null;
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(private readonly maxConcurrentPages: number = PdfRenderer.configuredLimit()) {}

  static configuredLimit(): number {
    const configured = Number(process.env.PDF_MAX_CONCURRENT_PAGES);
    return Number.isInteger(configured) && configured >= 1
      ? Math.min(configured, MAX_CONFIGURABLE_PAGES)
      : DEFAULT_MAX_CONCURRENT_PAGES;
  }

  async render(html: string, options: PDFOptions): Promise<Buffer> {
    await this.acquire();
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });
        await page.evaluateHandle('document.fonts.ready').catch(() => undefined);
        return Buffer.from(await page.pdf(options));
      } finally {
        await page.close().catch(() => undefined);
      }
    } finally {
      this.release();
    }
  }

  async close(): Promise<void> {
    if (!this.browserPromise) return;
    const browser = await this.browserPromise.catch(() => null);
    this.browserPromise = null;
    await browser?.close().catch(() => undefined);
  }

  private acquire(): Promise<void> {
    if (this.active < this.maxConcurrentPages) {
      this.active += 1;
      return Promise.resolve();
    }
    // The slot is handed over directly by release(), so `active` is unchanged.
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active -= 1;
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browserPromise) {
      this.browserPromise = import('puppeteer')
        .then((puppeteer) =>
          puppeteer.launch({
            headless: true,
            // Use a system-installed Chromium when PUPPETEER_EXECUTABLE_PATH is set (CI/server
            // deploys skip Puppeteer's own Chrome download - see PUPPETEER_SKIP_DOWNLOAD in
            // .env.example). Falls back to Puppeteer's bundled Chrome when it is not set.
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
          }),
        )
        .catch((error) => {
          this.browserPromise = null;
          throw error;
        });
    }

    const browser = await this.browserPromise;
    if (!browser.connected) {
      this.logger.warn('Shared Puppeteer browser was disconnected; relaunching.');
      this.browserPromise = null;
      return this.getBrowser();
    }
    return browser;
  }
}

/** The process-wide renderer used by every PDF-producing service. */
export const sharedPdfRenderer = new PdfRenderer();
