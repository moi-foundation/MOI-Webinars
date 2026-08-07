// Standalone registration probe — modeled on session-3/moi-agent-dating/scripts/register.mjs.
// Independent of session-7's code: fresh npm install, its own provider/wallet/registry instances.
// Only change from session 3: the card is inlined as a data: URI instead of a hosted uploader.
import { readFileSync } from 'node:fs'
import { VoyageProvider, Wallet } from 'js-moi-sdk'
import { AgentRegistry } from 'js-moi-agent-registry'

// read the mnemonic from session-7's .env (same funded devnet wallet)
const env = Object.fromEntries(
  readFileSync(new URL('../session-7/.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const provider = new VoyageProvider('devnet')
const wallet = await Wallet.fromMnemonic(env.USER_MNEMONIC, "m/44'/6174'/7020'/0/0")
wallet.connect(provider)
const ownerAddress = (await wallet.getIdentifier()).toString()
console.log('owner:', ownerAddress)

const registry = await AgentRegistry.init({
  wallet,
  uploader: async (cardJson) => `data:application/json;base64,${Buffer.from(cardJson, 'utf8').toString('base64')}`,
})

const count = await registry.getAgentCount()
console.log(`registry read OK — ${count} agents on registry`)

console.log('registering test agent (session-3 style createAgent)...')
const t0 = Date.now()
try {
  const agentId = await registry.createAgent(
    { protocol: 'a2a', protocolVersion: '1.0' },
    {
      name: 'Register Probe',
      description: 'Standalone probe checking whether registry writes mine on devnet.',
      version: '0.1.0',
      url: 'https://example.com/register-probe',
      agentWallet: ownerAddress,
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      preferredTransport: 'JSONRPC',
      skills: [
        { id: 'say-hi', name: 'Say Hi', description: 'Probe skill.', tags: ['demo', 'probe'] },
      ],
    },
  )
  console.log(`REGISTERED in ${Math.round((Date.now() - t0) / 1000)}s — agent id: ${agentId}`)
  const { profile, found } = await registry.getAgentProfile(agentId)
  console.log('read-back:', found ? `${profile.agent_id} status=${profile.status}` : 'NOT FOUND')
} catch (err) {
  console.log(`FAILED after ${Math.round((Date.now() - t0) / 1000)}s: ${err?.cause?.message ?? err?.message ?? err}`)
  process.exit(1)
}
