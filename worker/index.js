const STATIC_ASSETS = new Map(/* __STATIC_ASSETS__ */);

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function serveAsset(asset, method, isIndex = false) {
  return new Response(method === 'HEAD' ? null : decodeBase64(asset.body), {
    status: 200,
    headers: {
      'content-type': asset.contentType,
      'cache-control': isIndex
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

/**
 * Standalone Cloudflare Worker entry point used by OpenAI Sites.
 *
 * The Sites packaging contract currently deploys dist/server/index.js but does
 * not automatically expose a Vite asset binding. The build step embeds Vite's
 * small static output into this worker so the exact validated build is served
 * without a runtime dependency.
 */
export default {
  async fetch(request) {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method not allowed.', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      });
    }

    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname);
    const directAsset = STATIC_ASSETS.get(pathname);
    if (directAsset) return serveAsset(directAsset, method, pathname === '/index.html');

    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    if (pathname === '/' || acceptsHtml) {
      const indexAsset = STATIC_ASSETS.get('/index.html');
      if (indexAsset) return serveAsset(indexAsset, method, true);
    }

    return new Response('Not found.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
