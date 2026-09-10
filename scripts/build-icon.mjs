#!/usr/bin/env node
/**
 * Render build/icon.svg -> build/icon.png at 1024x1024.
 *
 * electron-builder converts that PNG into .icns and .ico at package time, so
 * the PNG is the only raster we need to keep. The SVG stays the source of
 * truth; regenerate with `npm run icon` after editing it.
 *
 * Uses headless Chrome rather than an image library to avoid adding a native
 * dependency to a project that otherwise has none. Chrome is already present
 * as the test runner's browser.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SIZE = 1024;
const root = resolve(import.meta.dirname, '..');
const svg = join(root, 'build', 'icon.svg');
const out = join(root, 'build', 'icon.png');

const CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
].filter(Boolean);

const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error('No Chrome-family browser found. Set CHROME_BIN to one.');
  process.exit(1);
}
if (!existsSync(svg)) {
  console.error(`Missing ${svg}`);
  process.exit(1);
}

// Chrome writes screenshot.png into the working directory it is given.
const work = mkdtempSync(join(tmpdir(), 'em-icon-'));
try {
  execFileSync(chrome, [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    // Transparent background: an opaque white one would square off the corners.
    '--default-background-color=00000000',
    `--screenshot=${join(work, 'icon.png')}`,
    `--window-size=${SIZE},${SIZE}`,
    `file://${svg}`,
  ], { stdio: 'pipe' });

  copyFileSync(join(work, 'icon.png'), out);
  console.log(`build/icon.png  ${SIZE}x${SIZE}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
