// Try RegisterAgent with fuel_limit=10000 (the value the mined transfers use).
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
const owner = (await wallet.getIdentifier()).toString()

const rpc = async (method, params) => {
  const res = await fetch(provider.host, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return res.json()
}

// what does the account hold? (balance RPC wants an asset id, so try KMOI via AccountState)
const state = await rpc('moi.AccountState', [{ identifier: owner }])
console.log('account state:', JSON.stringify(state.result ?? state.error).slice(0, 300))

const registry = await AgentRegistry.init({
  wallet,
  uploader: async (cardJson) => `data:application/json;base64,${Buffer.from(cardJson, 'utf8').toString('base64')}`,
})
const cardUri = 'data:application/json;base64,' + Buffer.from('{"probe":"fuel10k"}').toString('base64')

// ask the node what this actually costs
const ctx = registry.driver.routines.RegisterAgent('https://example.com', cardUri, owner, owner)
try {
  const estimate = await ctx.estimateFuel()
  console.log('node fuel estimate for RegisterAgent:', estimate)
} catch (e) {
  console.log('fuel estimate failed:', e?.message)
}

console.log('submitting with fuel_limit=10000...')
const response = await registry.driver.routines
  .RegisterAgent('https://example.com', cardUri, owner, owner)
  .send({ fuel_limit: 10000, fuel_price: 1 })
console.log('submitted:', response.hash)
for (let t = 10; t <= 90; t += 10) {
  await new Promise((r) => setTimeout(r, 10000))
  const receipt = await rpc('moi.InteractionReceipt', [{ hash: response.hash }])
  if (receipt.result) {
    console.log(`MINED after ~${t}s — fuel limit was the problem!`)
    console.log('receipt status:', receipt.result.status, 'fuel used:', receipt.result.fuel_used)
    process.exit(0)
  }
  console.log(`t+${t}s: no receipt (${receipt.error?.message})`)
}
console.log('NOT MINED with fuel_limit=10000 either')
