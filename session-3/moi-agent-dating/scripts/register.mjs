import { VoyageProvider, Wallet } from 'js-moi-sdk'
import { AgentRegistry } from 'js-moi-agent-registry'

function envRequired(name) {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`missing required env var: ${name}`)
  return v
}

function buildHostedUploader(uploaderUrl) {
  return async (cardJson) => {
    let res
    try {
      res = await fetch(uploaderUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cardJson,
      })
    } catch (err) {
      throw new Error(`UPLOADER_URL=${uploaderUrl} unreachable — ${err.message ?? err}`)
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '<no body>')
      throw new Error(`uploader rejected card — POST ${uploaderUrl} → HTTP ${res.status}: ${body}`)
    }
    let parsed
    try {
      parsed = await res.json()
    } catch (err) {
      throw new Error(`uploader response was not JSON — ${err.message ?? err}`)
    }
    if (typeof parsed?.uri !== 'string' || !parsed.uri) {
      throw new Error(`uploader response missing { uri } string; got ${JSON.stringify(parsed)}`)
    }
    return parsed.uri
  }
}

async function main() {
  const mnemonic = envRequired('MOI_MNEMONIC')
  const uploaderUrl = envRequired('UPLOADER_URL')
  const derivationPath = process.env.MOI_DERIVATION_PATH ?? "m/44'/6174'/7020'/0/0"
  const agentName = process.env.AGENT_NAME ?? 'OpenClaw Agent'
  const agentUrl = process.env.AGENT_URL ?? 'https://example.com/openclaw-agent'

  const provider = new VoyageProvider('devnet')
  const wallet = await Wallet.fromMnemonic(mnemonic, derivationPath)
  wallet.connect(provider)
  const ownerAddress = (await wallet.getIdentifier()).toString()

  const registry = await AgentRegistry.init({
    wallet,
    uploader: buildHostedUploader(uploaderUrl),
  })

  const totalBefore = await registry.getAgentCount()
  console.log(`[register] registry currently holds ${totalBefore} agents on devnet`)
  console.log(`[register] owner wallet : ${ownerAddress}`)
  console.log(`[register] agent name   : ${agentName}`)
  console.log(`[register] agent url    : ${agentUrl}`)
  console.log(`[register] uploader     : ${uploaderUrl}`)

  const agentId = await registry.createAgent(
    { protocol: 'a2a', protocolVersion: '1.0' },
    {
      name: agentName,
      description: 'OpenClaw agent registered via the moi-agent-dating skill.',
      version: '0.1.0',
      url: agentUrl,
      agentWallet: ownerAddress,
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      preferredTransport: 'JSONRPC',
      skills: [
        {
          id: 'say-hi',
          name: 'Say Hi',
          description: 'Accepts a one-line greeting from another MOI agent and responds.',
          tags: ['demo', 'a2a', 'openclaw'],
        },
      ],
    },
  )

  console.log(`[register] assigned agent_id: ${agentId}`)

  const { profile, found } = await registry.getAgentProfile(agentId)
  if (!found || !profile) {
    throw new Error(`registration succeeded but profile read-back returned not-found for ${agentId}`)
  }

  console.log(`[register] on-chain profile:`)
  console.log(JSON.stringify({
    agent_id: profile.agent_id,
    owner: profile.owner,
    agent_wallet: profile.agent_wallet,
    status: profile.status,
    url: profile.url,
    card_uri: profile.card_uri,
    score: profile.score.toString(),
    created_at: profile.created_at.toString(),
    updated_at: profile.updated_at.toString(),
  }, null, 2))
}

try {
  await main()
} catch (err) {
  console.error(`[error] ${err?.message ?? err}`)
  process.exit(1)
}
