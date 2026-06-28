import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const UPSTREAM = 'https://api.ibb.gov.tr'

// Per-endpoint freshness. Static data (stops/lines/route geometry) basically
// never changes during a session, so we cache it for hours. Only live vehicle
// positions need to be fresh.
function ttlFor(body) {
  if (body.includes('GetHatOtoKonum')) return 12000      // live line positions
  if (body.includes('GetFiloAracKonum')) return 25000    // heavy fleet snapshot
  return 6 * 60 * 60 * 1000                               // stops/lines/route stops
}

// After upstream signals a rate-limit fault, stop touching it for this long.
// This is the key to recovering: hammering the gateway during its penalty
// window keeps the window from ever resetting.
const COOLDOWN = 60000
// How long a cached good response may still be served as a fallback.
const STALE_MAX = 30 * 60 * 1000

function isFault(text) {
  const t = text.toLowerCase()
  return (
    t.includes('policy falsified') ||
    t.includes('rate limit') ||
    t.includes('soap:fault') ||
    t.includes('soapenv:fault')
  )
}

/**
 * Caching + circuit-breaking reverse proxy for the IBB/IETT SOAP API.
 *
 * - identical request within its TTL        → served from cache (no upstream)
 * - circuit open (recent rate-limit fault)   → served stale, upstream untouched
 * - upstream fault                           → open circuit + serve last good
 * - upstream network error                   → serve last good
 *
 * Net effect: bursts (reloads, StrictMode, multiple tabs) cost nothing, and a
 * tripped rate limit is given room to reset instead of being held open.
 */
function iettCacheProxy() {
  const cache = new Map() // key -> { time, status, body, contentType }
  let breakerUntil = 0

  return {
    name: 'iett-cache-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next()

        const chunks = []
        for await (const c of req) chunks.push(c)
        const body = Buffer.concat(chunks).toString('utf8')

        const path = req.url.replace(/^\/api/, '')
        const key = `${req.method} ${path} ${body}`
        const now = Date.now()
        const cached = cache.get(key)

        const send = (status, text, contentType, state) => {
          res.statusCode = status
          res.setHeader('Content-Type', contentType || 'text/xml; charset=utf-8')
          res.setHeader('X-Proxy-Cache', state)
          res.end(text)
        }
        const serveStaleOr = (faultStatus, faultText, faultType, state) => {
          if (cached && now - cached.time < STALE_MAX) {
            return send(cached.status, cached.body, cached.contentType, state)
          }
          return send(faultStatus, faultText, faultType, 'FAULT')
        }

        // 1) Fresh cache hit → no upstream call.
        if (cached && now - cached.time < ttlFor(body)) {
          return send(cached.status, cached.body, cached.contentType, 'HIT')
        }

        // 2) Circuit open → do NOT touch upstream; serve stale if we can.
        if (now < breakerUntil) {
          return serveStaleOr(503, 'rate-limit cooldown', 'text/plain', 'COOLDOWN')
        }

        // 3) Try upstream.
        try {
          const upstream = await fetch(UPSTREAM + path, {
            method: req.method,
            headers: {
              'Content-Type': req.headers['content-type'] || 'text/xml; charset=utf-8',
              'SOAPAction': req.headers['soapaction'] || '',
            },
            body: req.method === 'POST' ? body : undefined,
          })
          const text = await upstream.text()
          const contentType = upstream.headers.get('content-type') || 'text/xml; charset=utf-8'

          if (upstream.ok && !isFault(text)) {
            cache.set(key, { time: now, status: upstream.status, body: text, contentType })
            return send(upstream.status, text, contentType, 'MISS')
          }

          // Rate-limited / fault → open the circuit, then serve stale.
          breakerUntil = now + COOLDOWN
          return serveStaleOr(upstream.status, text, contentType, 'STALE')
        } catch (err) {
          return serveStaleOr(502, `proxy error: ${err.message}`, 'text/plain', 'STALE-ERR')
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), iettCacheProxy()],
})
