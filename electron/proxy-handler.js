/**
 * Shared Creatio CORS proxy logic.
 *
 * Used by BOTH:
 *   - proxy-server.js        (standalone, for `ng serve` web development)
 *   - electron/static-server.js (mounted inside the Electron main process)
 *
 * Keeping one implementation is deliberate: a fix to cookie handling or
 * auth relay must land for the web app and the desktop app at the same time.
 *
 * Request shape:  /creatio-proxy/<url-safe-base64 target origin>/<path>
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PROXY_PREFIX = '/creatio-proxy';

/**
 * Per-request opt-out of TLS verification.
 *
 * Set ONLY by odata-connection.service, and only for an environment the user
 * has explicitly marked as trusting a self-signed certificate. The proxy binds
 * to 127.0.0.1, so the header is reachable only by local processes -- which
 * could make their own unverified request anyway, so it grants no new power.
 */
const INSECURE_TLS_HEADER = 'x-em-allow-insecure-tls';

/** Node TLS failures that a self-signed certificate typically produces. */
const TLS_ERROR_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'ERR_TLS_INVALID_PROTOCOL_VERSION',
]);

/** Stored cookies per target host (simple in-memory cookie jar) */
const cookieJar = new Map();

function corsHeaders(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, BPMCSRF, Accept',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

/** True if this request is addressed to the proxy. */
function isProxyRequest(req) {
  return req.url.startsWith(PROXY_PREFIX + '/') || req.method === 'OPTIONS';
}

/**
 * Handle a proxied request.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{ allowInsecureTls?: boolean, log?: (msg: string) => void }} [options]
 *
 * TLS verification is ON by default and is disabled only for a single request
 * carrying the opt-in header. Disabling it defeats MITM protection, so it is
 * never a server-wide default: an on-prem Creatio with a self-signed
 * certificate has to be trusted explicitly, per environment, by the user.
 */
async function handleProxyRequest(req, res, options = {}) {
  const { allowInsecureTls = false, log = () => {} } = options;

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

  let targetUrl;
  try {
    targetUrl = new URL(targetBase + match[2]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Invalid target URL');
    return;
  }

  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Only http(s) targets are allowed');
    return;
  }

  log(`[proxy] ${req.method} ${targetUrl.href}`);

  // Collect request body
  const bodyChunks = [];
  for await (const chunk of req) bodyChunks.push(chunk);
  const body = Buffer.concat(bodyChunks);

  // Forward headers (strip hop-by-hop / origin-identifying, add cookies)
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
  const insecure = allowInsecureTls || req.headers[INSECURE_TLS_HEADER] === '1';
  if (insecure) {
    log(`[proxy] TLS verification DISABLED for ${targetUrl.host} (user opt-in)`);
  }
  // Never forward the control header to the upstream server.
  delete fwdHeaders[INSECURE_TLS_HEADER];

  const proxyReq = transport.request(targetUrl.href, {
    method: req.method,
    headers: fwdHeaders,
    rejectUnauthorized: !insecure,
  }, (proxyRes) => {
    // Store set-cookie from response
    const setCookies = proxyRes.headers['set-cookie'];
    if (setCookies) {
      const merged = setCookies.map(c => c.split(';')[0]).join('; ');
      const existing = cookieJar.get(hostKey) || '';
      const cookieMap = new Map();
      for (const pair of existing.split('; ').filter(Boolean)) {
        cookieMap.set(pair.split('=')[0], pair);
      }
      for (const pair of merged.split('; ').filter(Boolean)) {
        cookieMap.set(pair.split('=')[0], pair);
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
    log(`[proxy] error: ${err.message}`);
    // Flag certificate failures distinctly so the UI can offer to trust this
    // host rather than showing a generic, unactionable connection error.
    const tlsError = TLS_ERROR_CODES.has(err.code);
    res.writeHead(502, { ...corsHeaders(req), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message, code: err.code, tlsError }));
  });

  if (body.length > 0) proxyReq.write(body);
  proxyReq.end();
}

/** Clear the cookie jar (e.g. on sign-out). */
function clearCookies() {
  cookieJar.clear();
}

module.exports = {
  PROXY_PREFIX, INSECURE_TLS_HEADER, isProxyRequest,
  handleProxyRequest, corsHeaders, clearCookies,
};
