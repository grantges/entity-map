/**
 * Local HTTP server for the packaged Electron app.
 *
 * WHY a server instead of loading the built app over file:// --
 * three things in the renderer break on a file:// origin:
 *
 *   1. crypto.subtle (crypto-storage.service.ts) requires a SECURE CONTEXT.
 *      file:// is not one in Chromium, so encrypted API-key storage fails.
 *   2. Angular's PathLocationStrategy + <base href="/"> can't resolve.
 *   3. Module Web Workers (metadata-parser.service.ts) load unreliably.
 *
 * http://127.0.0.1 IS a secure context, so serving from localhost keeps all
 * three working with zero changes to the Angular source. It also means the
 * renderer's relative `/creatio-proxy/...` URLs resolve to this same origin,
 * so odata-connection.service.ts needs no desktop-specific code path.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { isProxyRequest, handleProxyRequest } = require('./proxy-handler');

/**
 * FIXED port -- deliberately not an ephemeral one.
 *
 * IndexedDB and localStorage are scoped per ORIGIN. An ephemeral port makes the
 * origin change on every launch, which silently wipes saved environments, saved
 * Creatio connections, and the stored OpenAI key each time the app restarts.
 * The port is part of the origin, so it has to be stable for data to persist.
 *
 * If this port is already taken we fail LOUDLY rather than binding elsewhere:
 * quietly moving to another port is what destroys user data.
 */
const APP_PORT = Number(process.env.EM_PORT) || 43117;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Start the app server on an ephemeral port.
 *
 * @param {{ root: string, allowInsecureTls?: boolean, log?: (m: string) => void }} opts
 * @returns {Promise<{ port: number, origin: string, close: () => Promise<void> }>}
 */
function startServer({ root, port = APP_PORT, allowInsecureTls = false, log = () => {} }) {
  const indexPath = path.join(root, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return Promise.reject(
      new Error(`Build output not found at ${root}. Run \`npm run build\` first.`)
    );
  }

  const server = http.createServer((req, res) => {
    if (isProxyRequest(req)) {
      handleProxyRequest(req, res, { allowInsecureTls, log }).catch((err) => {
        log(`[proxy] unhandled: ${err.message}`);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
      return;
    }
    serveStatic(req, res, root, indexPath, log);
  });

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        const e = new Error(
          `Port ${port} is already in use. Entity Map needs this specific port: ` +
          `its saved environments and connections are tied to the ` +
          `http://127.0.0.1:${port} origin, so starting on a different port ` +
          `would hide your existing data.\n\nClose whatever is using port ${port} ` +
          `and try again, or set EM_PORT to a different value permanently.`
        );
        e.code = 'EADDRINUSE';
        reject(e);
      } else {
        reject(err);
      }
    });

    server.listen(port, '127.0.0.1', () => {
      log(`[server] listening on http://127.0.0.1:${port} (root: ${root})`);
      resolve({
        port,
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function serveStatic(req, res, root, indexPath, log) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Resolve inside root and reject traversal attempts.
  const resolved = path.resolve(root, '.' + path.posix.normalize(urlPath));
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let filePath = resolved;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback: unknown paths without a file extension are Angular routes.
    if (path.extname(urlPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    filePath = indexPath;
  }

  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  stream.on('error', (err) => {
    log(`[server] read error ${filePath}: ${err.message}`);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': filePath === indexPath ? 'no-cache' : 'public, max-age=31536000',
  });
  stream.pipe(res);
}

module.exports = { startServer };
