import { serve } from 'bun'

const HARDCODED_PROJECT_ID = 'empo-health-antigravity'

serve({
  port: 8080,
  async fetch(req) {
    const url = new URL(req.url)
    // Forward everything to cloudcode-pa.googleapis.com
    const targetUrl = `https://cloudcode-pa.googleapis.com${url.pathname}${url.search}`
    
    // Copy original headers
    const headers = new Headers(req.headers)
    // Inject the quota project header
    headers.set('x-goog-user-project', HARDCODED_PROJECT_ID)
    // Remove host header so fetch sets it correctly
    headers.delete('host')

    console.log(`[PROXY] Forwarding ${req.method} ${url.pathname} to cloudcode-pa`)

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    })

    // Forward the response back
    const responseHeaders = new Headers(response.headers)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  },
})

console.log('Proxy listening on http://127.0.0.1:8080')
