// Capture the exact raw errors: submit a RegisterAgent, print the submitted hash,
// then hit the raw JSON-RPC endpoints for the interaction and its receipt.
import { readFileSync } from 'node:fs'
import { VoyageProvider, Wallet } from 'js-moi-sdk'
import { AgentRegistry } from 'js-moi-agent-registry'

const env = Object.fromEntries(
  readFileSync(new URL('../session-7/.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)

const provider = new VoyageProvider('devnet')
const wallet = await Wallet.fromMnemonic(env.USER_MNEMONIC, "m/44'/6174'/7020'/0/0")
wallet.connect(provider)

const host = provider.host
console.log('rpc endpoint:', host)
const rpc = async (method, params) => {
  const res = await fetch(host, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return res.json()
}

const registry = await AgentRegistry.init({
  wallet,
  uploader: async (cardJson) => `data:application/json;base64,${Buffer.from(cardJson, 'utf8').toString('base64')}`,
})

// submit via the underlying driver so we can grab the ix hash before wait() times out
const owner = (await wallet.getIdentifier()).toString()
const cardUri = 'data:application/json;base64,' + Buffer.from('{"probe":true}').toString('base64')
console.log('submitting RegisterAgent...')
const response = await registry.driver.routines.RegisterAgent('https://example.com', cardUri, owner, owner).send()
console.log('submitted ix hash:', response.hash)

// poll the raw receipt endpoint and print the exact JSON-RPC responses over 90s
for (const delay of [5, 15, 30, 60, 90]) {
  await new Promise((r) => setTimeout(r, (delay === 5 ? 5 : delay - [5, 15, 30, 60, 90][[5, 15, 30, 60, 90].indexOf(delay) - 1]) * 1000))
  const receipt = await rpc('moi.InteractionReceipt', [{ hash: response.hash }])
  console.log(`t+${delay}s moi.InteractionReceipt:`, JSON.stringify(receipt))
  if (receipt.result) process.exit(0)
}

const ix = await rpc('moi.InteractionByHash', [{ hash: response.hash }])
console.log('moi.InteractionByHash:', JSON.stringify(ix).slice(0, 600))

// also show what the SDK's own wait() throws, with the full error chain
try {
  await response.wait()
} catch (err) {
  console.log('\nSDK wait() error object:')
  console.log(JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
}
