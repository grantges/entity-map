/**
 * Standalone CORS proxy for web development (`ng serve`).
 *
 * Creatio doesn't set Access-Control-Allow-Origin for external origins, so
 * browser fetch() from localhost fails at the preflight check.
 *
 * The forwarding logic lives in electron/proxy-handler.js and is shared with
 * the Electron main process, so the desktop and web builds cannot drift.
 *
 * Start alongside ng serve:   node proxy-server.js   (or: npm run start:live)
 * Angular's proxy.conf.json routes /creatio-proxy/* here.
 */

const http = require('http');
const { handleProxyRequest } = require('./electron/proxy-handler');

const PORT = process.env.EM_PROXY_PORT || 3100;

http.createServer((req, res) => {
  handleProxyRequest(req, res, { log: (m) => console.log(m) }).catch((err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => {
  console.log(`Creatio CORS proxy running on http://localhost:${PORT}`);
  console.log('Requests: /creatio-proxy/<base64-target-url>/<path>');
});
