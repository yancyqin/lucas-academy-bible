/**
 * Cloudflare Worker entry point used by OpenAI Sites.
 *
 * Vite owns the static assets. This worker delegates asset requests to the
 * platform binding and falls back to index.html for client-side routes.
 */
export default {
  async fetch(request, env) {
    if (!env?.ASSETS?.fetch) {
      return new Response('Static asset binding is unavailable.', { status: 500 });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) return assetResponse;

    const method = request.method.toUpperCase();
    const acceptsHtml = request.headers.get('accept')?.includes('text/html');
    if ((method !== 'GET' && method !== 'HEAD') || !acceptsHtml) {
      return assetResponse;
    }

    const indexUrl = new URL('/index.html', request.url);
    return env.ASSETS.fetch(new Request(indexUrl, request));
  },
};
