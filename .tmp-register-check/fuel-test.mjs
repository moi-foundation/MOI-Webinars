// Rule gas in or out: compare fuel fields of a mined transfer vs the stuck register,
// check balances, then resubmit RegisterAgent with a much higher fuel limit.
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

// 1. fuel fields of the mined payment transfer from today's happy path
const mined = await rpc('moi.InteractionByHash', [
  { hash: '0x05215433345446aae8bd467f09441e730c37283fec35862779fbf7383adcbe0d' },
])
const m = mined.result
console.log('mined transfer   fuel_price:', m?.fuel_price, ' fuel_limit:', m?.fuel_limit)

// 2. fuel fields of the stuck RegisterAgent
const stuck = await rpc('moi.InteractionByHash', [
  { hash: '0xa2cc98cd73ec25200ad63140027de20debd6187f4c583f81e7743687f9e1dc60' },
])
const s = stuck.result
console.log('stuck register   fuel_price:', s?.fuel_price, ' fuel_limit:', s?.fuel_limit)

// 3. balances (TDU = the account's token holdings, incl. the fee token)
const tdu = await rpc('moi.TDU', [{ identifier: owner }])
console.log('account TDU:', JSON.stringify(tdu.result ?? tdu.error))

// 4. decisive test: resubmit RegisterAgent with a big fuel limit
const registry = await AgentRegistry.init({
  wallet,
  uploader: async (cardJson) => `data:application/json;base64,${Buffer.from(cardJson, 'utf8').toString('base64')}`,
})
const cardUri = 'data:application/json;base64,' + Buffer.from('{"probe":"fuel"}').toString('base64')
console.log('\nsubmitting RegisterAgent with fuel_limit=200000 (162x the default)...')
const response = await registry.driver.routines
  .RegisterAgent('https://example.com', cardUri, owner, owner)
  .send({ fuel_limit: 200000, fuel_price: 1 })
console.log('submitted:', response.hash)
for (let t = 0; t <= 90; t += 10) {
  await new Promise((r) => setTimeout(r, 10000))
  const receipt = await rpc('moi.InteractionReceipt', [{ hash: response.hash }])
  if (receipt.result) {
    console.log(`MINED after ~${t + 10}s — gas WAS the issue. receipt status:`, receipt.result.status)
    process.exit(0)
  }
  console.log(`t+${t + 10}s: still no receipt (${receipt.error?.message})`)
}
console.log('NOT MINED with 200k fuel — gas is ruled out')
