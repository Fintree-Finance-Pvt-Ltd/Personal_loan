import { lazy } from 'react';

const RELOAD_FLAG = 'lazy-chunk-reload-attempted';

const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed|ChunkLoadError/i;

const readFlag = () => {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === '1';
  } catch {
    return false;
  }
};

const writeFlag = (value) => {
  try {
    if (value) sessionStorage.setItem(RELOAD_FLAG, '1');
    else sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    // storage unavailable (private mode etc.) - the retry just cannot be remembered
  }
};

/**
 * React.lazy for a screen that lives in its own code-split chunk.
 *
 * A deploy replaces the hashed chunk files. A browser still holding the previous page then
 * fails to fetch a chunk it asks for, which would otherwise be a blank screen. When that
 * happens we reload once so the browser picks up the new page; the sessionStorage flag stops
 * it from ever reloading in a loop if the chunk really is unavailable.
 *
 * `exportName` picks a named export (pages here mostly use `export function Page`).
 */
export function lazyWithRetry(importer, exportName = 'default') {
  return lazy(async () => {
    try {
      const module = await importer();
      writeFlag(false);
      return exportName === 'default' ? module : { default: module[exportName] };
    } catch (error) {
      if (CHUNK_ERROR.test(String(error?.message ?? error)) && !readFlag()) {
        writeFlag(true);
        window.location.reload();
        // Never settles: the page is reloading, so there is nothing to render meanwhile.
        return new Promise(() => {});
      }
      throw error;
    }
  });
}
