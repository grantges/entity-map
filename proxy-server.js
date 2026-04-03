/**
 * Local CORS proxy for Creatio connections.
 *
 * Creatio doesn't set Access-Control-Allow-Origin for external origins,
 * so browser fetch() from localhost fails at the preflight check.
 *
 * This tiny server accepts requests at:
 *   /creatio-proxy/<base64-encoded-target-origin>/<path>
 *
 * and forwards them to the decoded target, relaying headers and cookies.
 *
 * Start alongside ng serve:
 *   node proxy-server.js
 *
 * Angular's proxy.conf.json routes /creatio-proxy/* to this server.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = 3100;

/** Stored cookies per target host (simple in-memory cookie jar) */
const cookieJar = new Map();

http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    res.end();
    return;
  }

  // Parse: /creatio-proxy/<base64target>/<rest-of-path>
  // URL-safe base64 uses [A-Za-z0-9_-] (no + / =)
  const match = req.url.match(/^\/creatio-proxy\/([A-Za-z0-9_-]+)(\/.*)/);
  if (!match) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Expected /creatio-proxy/<base64url>/<path>');
    return;
  }

  let targetBase;
  try {
    // Restore standard base64 from URL-safe variant, then decode
    const b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
    targetBase = Buffer.from(b64, 'base64').toString('utf-8');
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid base64 target');
    return;
  }

  const targetPath = match[2];
  const targetUrl = new URL(targetBase + targetPath);
  console.log(`[proxy] ${req.method} ${targetUrl.href}`);

  // Collect request body
  const bodyChunks = [];
  for await (const chunk of req) bodyChunks.push(chunk);
  const body = Buffer.concat(bodyChunks);

  // Forward headers (strip host, add cookies)
  const fwdHeaders = {};
  for (const [key, val] of Object.entries(req.headers)) {
    if (['host', 'origin', 'referer', 'connection'].includes(key)) continue;
    fwdHeaders[key] = val;
  }

  // Attach cookies from jar
  const hostKey = targetUrl.host;
  const jarCookies = cookieJar.get(hostKey);
  if (jarCookies) {
    fwdHeaders['cookie'] = jarCookies;
  }

  const transport = targetUrl.protocol === 'https:' ? https : http;

  const proxyReq = transport.request(targetUrl.href, {
    method: req.method,
    headers: fwdHeaders,
    rejectUnauthorized: false, // Allow self-signed certs in dev
  }, (proxyRes) => {
    // Store set-cookie from response
    const setCookies = proxyRes.headers['set-cookie'];
    if (setCookies) {
      const merged = setCookies.map(c => c.split(';')[0]).join('; ');
      const existing = cookieJar.get(hostKey) || '';
      // Merge new cookies with existing
      const cookieMap = new Map();
      for (const pair of existing.split('; ').filter(Boolean)) {
        const [k] = pair.split('=');
        cookieMap.set(k, pair);
      }
      for (const pair of merged.split('; ').filter(Boolean)) {
        const [k] = pair.split('=');
        cookieMap.set(k, pair);
      }
      cookieJar.set(hostKey, [...cookieMap.values()].join('; '));
    }

    // Relay response with CORS headers
    const respHeaders = { ...corsHeaders(req) };
    for (const [key, val] of Object.entries(proxyRes.headers)) {
      if (key === 'set-cookie' || key === 'transfer-encoding') continue;
      respHeaders[key] = val;
    }

    res.writeHead(proxyRes.statusCode, respHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, corsHeaders(req));
    res.end(JSON.stringify({ error: err.message }));
  });

  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();

}).listen(PORT, () => {
  console.log(`Creatio CORS proxy running on http://localhost:${PORT}`);
  console.log('Requests: /creatio-proxy/<base64-target-url>/<path>');
});

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, BPMCSRF, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}
