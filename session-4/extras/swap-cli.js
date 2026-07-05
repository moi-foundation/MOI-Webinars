import { env, loadBothWallets } from '../logic/wallets.js'
import { claim, getAssetBalance, lockup } from '../logic/swap.js'

const SWAP_RATE = 0.9 // 1 TKA = 0.9 TKB (display only)
const SEND_AMOUNT = 100
const RECEIVE_AMOUNT = Math.round(SEND_AMOUNT * SWAP_RATE)

const tkaId = env('VITE_TKA_ASSET_ID')
const tkbId = env('VITE_TKB_ASSET_ID')

async function printAllBalances(alice, bob) {
  console.log('\nBalances')
  const rows = [
    ['Alice TKA', tkaId, alice],
    ['Alice TKB', tkbId, alice],
    ['Bob TKA', tkaId, bob],
    ['Bob TKB', tkbId, bob],
  ]
  for (const [label, assetId, who] of rows) {
    try {
      const balance = await getAssetBalance(assetId, who.address, who.wallet)
      console.log(`  ${label.padEnd(10)} ${balance}`)
    } catch {
      console.log(`  ${label.padEnd(10)} (account not on devnet)`)
    }
  }
}

async function runFullSwap() {
  const { alice, bob } = await loadBothWallets()
  console.log(`\nSwap: Alice sends ${SEND_AMOUNT} TKA, receives ${RECEIVE_AMOUNT} TKB`)
  console.log(`Rate (display only): 1 TKA = ${SWAP_RATE} TKB`)
  await printAllBalances(alice, bob)

  console.log('\n── Step 1: Alice locks 100 TKA for Bob (irrevocable offer) ──')
  await lockup(tkaId, alice.wallet, bob.address, SEND_AMOUNT)
  await printAllBalances(alice, bob)

  console.log('\n── Step 2: Bob locks 90 TKB for Alice ──')
  await lockup(tkbId, bob.wallet, alice.address, RECEIVE_AMOUNT)
  await printAllBalances(alice, bob)

  console.log('\n── Step 3: Alice claims her 90 TKB from Bob\'s lock ──')
  await claim(tkbId, alice.wallet, bob.address, alice.address, RECEIVE_AMOUNT)
  await printAllBalances(alice, bob)

  console.log('\n── Step 4: Bob claims his 100 TKA from Alice\'s lock ──')
  await claim(tkaId, bob.wallet, alice.address, bob.address, SEND_AMOUNT)
  await printAllBalances(alice, bob)

  console.log('\n✓ Swap complete\n')
}

const steps = {
  'lock-alice': async () => {
    const { alice, bob } = await loadBothWallets()
    console.log('\n── Alice locks 100 TKA for Bob ──')
    await lockup(tkaId, alice.wallet, bob.address, SEND_AMOUNT)
    await printAllBalances(alice, bob)
  },
  'lock-bob': async () => {
    const { alice, bob } = await loadBothWallets()
    console.log('\n── Bob locks 90 TKB for Alice ──')
    await lockup(tkbId, bob.wallet, alice.address, RECEIVE_AMOUNT)
    await printAllBalances(alice, bob)
  },
  'claim-alice': async () => {
    const { alice, bob } = await loadBothWallets()
    console.log('\n── Alice claims 90 TKB from Bob\'s lock ──')
    await claim(tkbId, alice.wallet, bob.address, alice.address, RECEIVE_AMOUNT)
    await printAllBalances(alice, bob)
  },
  'claim-bob': async () => {
    const { alice, bob } = await loadBothWallets()
    console.log('\n── Bob claims 100 TKA from Alice\'s lock ──')
    await claim(tkaId, bob.wallet, alice.address, bob.address, SEND_AMOUNT)
    await printAllBalances(alice, bob)
  },
  balances: async () => {
    const { alice, bob } = await loadBothWallets()
    await printAllBalances(alice, bob)
  },
  full: runFullSwap,
}

const cmd = process.argv[2] ?? 'full'
if (!steps[cmd]) {
  console.error(`Unknown command: ${cmd}`)
  console.error('Usage: node extras/swap-cli.js [full|lock-alice|lock-bob|claim-alice|claim-bob|balances]')
  process.exit(1)
}

steps[cmd]().catch((err) => {
  console.error('\nSwap failed:', err.message ?? err)
  process.exit(1)
})
