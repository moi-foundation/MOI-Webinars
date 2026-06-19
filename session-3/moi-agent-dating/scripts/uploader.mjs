// Minimal local card uploader for the moi-agent-dating skill smoke-test.
//
// Contract expected by register.mjs:
//   POST <body: agent card JSON>
//   → 200 { "uri": "<some-uri-string>" }
//
// This shim just re-encodes the posted card as a `data:` URI and returns it.
// That URI ends up on chain as `card_uri` for the agent — same shape a real
// uploader (IPFS pin, S3 PUT, etc.) would produce, just without the upload.
//
// Run:    node uploader.mjs              (listens on :7777)
//         PORT=8080 node uploader.mjs    (override port)
// In .env: UPLOADER_URL=http://localhost:7777
//
// register.mjs runs in the same shell, so localhost reaches this fine —
// no ngrok / cloudflared / tunnel of any kind required.

import http from 'node:http'

const PORT = Number(process.env.PORT ?? 7777)

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'POST only' }))
  }

  let body = ''
  for await (const chunk of req) body += chunk

  try {
    JSON.parse(body)
  } catch {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'body must be JSON' }))
  }

  const uri = `data:application/json;base64,${Buffer.from(body).toString('base64')}`
  console.log(`[uploader] accepted card (${body.length} bytes) → ${uri.slice(0, 64)}…`)

  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ uri }))
})

// Bind to both IPv4 and IPv6 loopback so Node 18+ `fetch('http://localhost:...')`
// reaches it whether DNS resolves localhost to 127.0.0.1 or ::1.
server.listen(PORT, '::', () => {
  console.log(`[uploader] listening on http://localhost:${PORT} (dual-stack ::)`)
  console.log(`[uploader] set in .env:  UPLOADER_URL=http://localhost:${PORT}`)
  console.log(`[uploader] Ctrl+C to stop`)
})
