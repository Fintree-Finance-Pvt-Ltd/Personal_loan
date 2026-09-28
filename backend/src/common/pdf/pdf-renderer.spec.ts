import * as puppeteer from 'puppeteer';
import { PdfRenderer } from './pdf-renderer';

jest.mock('puppeteer', () => ({ launch: jest.fn() }));

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await new Promise((resolve) => setImmediate(resolve));
};

/** A fake browser whose pdf() calls finish only when the test releases them. */
function fakeBrowser() {
  const state = { open: 0, maxOpen: 0, closed: 0, releases: [] as Array<() => void> };
  const newPage = jest.fn(async () => {
    state.open += 1;
    state.maxOpen = Math.max(state.maxOpen, state.open);
    return {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn(() => new Promise<Uint8Array>((resolve) => state.releases.push(() => resolve(new Uint8Array([37, 80, 68, 70]))))),
      close: jest.fn(async () => {
        state.open -= 1;
        state.closed += 1;
      }),
    };
  });
  return { state, browser: { connected: true, newPage, close: jest.fn().mockResolvedValue(undefined) } };
}

describe('PdfRenderer', () => {
  const launch = puppeteer.launch as unknown as jest.Mock;
  beforeEach(() => launch.mockReset());

  it('renders a PDF, closes the page, and keeps one browser for every render', async () => {
    const { browser, state } = fakeBrowser();
    launch.mockResolvedValue(browser);
    const renderer = new PdfRenderer(3);

    const first = renderer.render('<p>a</p>', { format: 'A4' });
    await flush();
    state.releases.shift()!();
    expect((await first).toString()).toBe('%PDF');

    const second = renderer.render('<p>b</p>', { format: 'A4' });
    await flush();
    state.releases.shift()!();
    await second;

    expect(launch).toHaveBeenCalledTimes(1);
    expect(state.closed).toBe(2);
  });

  it('never has more pages open than the configured limit, and every queued render still completes', async () => {
    const { browser, state } = fakeBrowser();
    launch.mockResolvedValue(browser);
    const renderer = new PdfRenderer(2);

    const renders = Array.from({ length: 5 }, (_, i) => renderer.render(`<p>${i}</p>`, { format: 'A4' }));
    await flush();
    expect(state.open).toBe(2);

    while (state.releases.length || state.open) {
      state.releases.shift()?.();
      await flush();
    }
    await Promise.all(renders);
    expect(state.maxOpen).toBe(2);
    expect(state.closed).toBe(5);
  });

  it('frees its slot when a render fails, so later renders are not blocked', async () => {
    const { browser, state } = fakeBrowser();
    launch.mockResolvedValue(browser);
    const renderer = new PdfRenderer(1);
    browser.newPage.mockRejectedValueOnce(new Error('page crashed'));

    await expect(renderer.render('<p>bad</p>', { format: 'A4' })).rejects.toThrow('page crashed');

    const next = renderer.render('<p>good</p>', { format: 'A4' });
    await flush();
    state.releases.shift()!();
    await expect(next).resolves.toBeInstanceOf(Buffer);
  });

  it('does not remember a failed launch - the next render tries again', async () => {
    const { browser, state } = fakeBrowser();
    launch.mockRejectedValueOnce(new Error('no chromium')).mockResolvedValue(browser);
    const renderer = new PdfRenderer(1);

    await expect(renderer.render('<p>a</p>', { format: 'A4' })).rejects.toThrow('no chromium');

    const retry = renderer.render('<p>b</p>', { format: 'A4' });
    await flush();
    state.releases.shift()!();
    await expect(retry).resolves.toBeInstanceOf(Buffer);
    expect(launch).toHaveBeenCalledTimes(2);
  });
});
