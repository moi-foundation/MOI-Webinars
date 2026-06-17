// Minimal /message endpoint for the moi-agent-dating skill's say-hi demo.
//
// Contract expected by say-hi.mjs:
//   POST /message
//   body:  { from: "<sender wallet hex>", text: "<greeting>" }
//   → 200  { ok: true, text: "<reply>" }
//
// Run:    node message-server.mjs              (listens on :3940)
//         PORT=4000 node message-server.mjs    (override port)
//
// Register your agent with AGENT_URL=http://localhost:<port> and the say-hi
// caller (running on the same machine) will reach it directly — no tunnel
// required. For OpenClaw agents on different machines, expose this via
// ngrok / cloudflared / your hosting platform and pass the public URL.

import http from 'node:http'

const PORT = Number(process.env.PORT ?? 3940)

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(body))
  }

  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    return send(200, { ok: true, agent: 'OpenClaw Agent B', skills: ['say-hi'] })
  }

  if (req.method !== 'POST' || req.url !== '/message') {
    return send(404, { error: `unsupported route ${req.method} ${req.url}` })
  }

  let raw = ''
  for await (const chunk of req) raw += chunk

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return send(400, { error: 'body must be JSON' })
  }

  const from = typeof body?.from === 'string' ? body.from : '<unknown>'
  const text = typeof body?.text === 'string' ? body.text : ''
  console.log(`[message-server] ${new Date().toISOString()}  from=${from.slice(0, 14)}…  text=${JSON.stringify(text)}`)

  const reply = `hi back — got "${text.slice(0, 80)}" from ${from.slice(0, 14)}…`
  return send(200, { ok: true, text: reply })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[message-server] listening on http://127.0.0.1:${PORT}`)
  console.log(`[message-server] register an agent with: AGENT_URL=http://localhost:${PORT}`)
  console.log(`[message-server] Ctrl+C to stop`)
})
