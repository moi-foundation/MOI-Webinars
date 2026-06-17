import { VoyageProvider, Wallet } from 'js-moi-sdk'
import { AgentRegistry } from 'js-moi-agent-registry'

function envRequired(name) {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`missing required env var: ${name}`)
  return v
}

async function main() {
  const targetAgentId = process.argv[2]
  if (!targetAgentId) {
    throw new Error('usage: node say-hi.mjs <target-agent-id> [<message>]')
  }
  const text = process.argv.slice(3).join(' ').trim() || 'hello from an OpenClaw agent on MOI'

  const mnemonic = envRequired('MOI_MNEMONIC')
  const derivationPath = process.env.MOI_DERIVATION_PATH ?? "m/44'/6174'/7020'/0/0"

  const provider = new VoyageProvider('devnet')
  const wallet = await Wallet.fromMnemonic(mnemonic, derivationPath)
  wallet.connect(provider)
  const myAddress = (await wallet.getIdentifier()).toString()

  const registry = await AgentRegistry.init({ wallet })
  const { profile, found } = await registry.getAgentProfile(targetAgentId)
  if (!found || !profile) {
    throw new Error(`target agent ${targetAgentId} not found in registry`)
  }
  if (!profile.url) {
    throw new Error(`target agent ${targetAgentId} has no url on its profile`)
  }
  if (profile.status !== 'ACTIVE') {
    console.log(`[say-hi] warning: target status is ${profile.status} (not ACTIVE) — calling anyway`)
  }

  const endpoint = `${profile.url.replace(/\/+$/, '')}/message`
  console.log(`[say-hi] from   : ${myAddress}`)
  console.log(`[say-hi] to     : ${profile.agent_id}  (${profile.url})`)
  console.log(`[say-hi] POST   : ${endpoint}`)
  console.log(`[say-hi] body   : { from, text }`)

  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: myAddress, text }),
    })
  } catch (err) {
    throw new Error(`HTTP POST to ${endpoint} failed: ${err?.message ?? err}`)
  }

  const status = res.status
  const body = await res.text().catch(() => '')
  if (!res.ok) {
    throw new Error(`agent at ${endpoint} returned HTTP ${status}: ${body || '<no body>'}`)
  }

  console.log(`[say-hi] HTTP ${status} reply:`)
  try {
    const parsed = JSON.parse(body)
    console.log(JSON.stringify(parsed, null, 2))
  } catch {
    console.log(body || '<empty body>')
  }
}

try {
  await main()
} catch (err) {
  console.error(`[error] ${err?.message ?? err}`)
  process.exit(1)
}
