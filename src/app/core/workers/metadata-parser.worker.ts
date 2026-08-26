/// <reference lib="webworker" />

/**
 * Thin adapter. The parsing itself lives in metadata-parser.core.ts so it can
 * be unit tested -- DOMParser is unavailable in workers, so the parser is
 * regex-based and worth testing directly.
 */
import { parseMetadataXml } from './metadata-parser.core';

addEventListener('message', ({ data }: MessageEvent<string>) => {
  const outcome = parseMetadataXml(data, (progress) => postMessage({ progress }));
  postMessage(outcome);
});
