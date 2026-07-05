// One-off: cheaply restore a clean 500000/0 baseline on already-deployed
// tokens using plain transfers, instead of paying gas to deploy new ones.
import { env, loadBothWallets } from '../logic/wallets.js'
import { getAssetBalance, transfer } from '../logic/swap.js'

const tkaId = env('VITE_TKA_ASSET_ID')
const tkbId = env('VITE_TKB_ASSET_ID')
const TARGET = 500000

async function main() {
  const { alice, bob } = await loadBothWallets()

  const [aliceTka, aliceTkb, bobTka, bobTkb] = await Promise.all([
    getAssetBalance(tkaId, alice.address, alice.wallet),
    getAssetBalance(tkbId, alice.address, alice.wallet),
    getAssetBalance(tkaId, bob.address, bob.wallet),
    getAssetBalance(tkbId, bob.address, bob.wallet),
  ])
  console.log(`Before:  Alice TKA ${aliceTka} TKB ${aliceTkb}   Bob TKA ${bobTka} TKB ${bobTkb}`)

  if (bobTka > 0n) {
    console.log(`\nBob → Alice: ${bobTka} TKA`)
    await transfer(tkaId, bob.wallet, alice.address, Number(bobTka))
  }
  if (aliceTkb > 0n) {
    console.log(`Alice → Bob: ${aliceTkb} TKB`)
    await transfer(tkbId, alice.wallet, bob.address, Number(aliceTkb))
  }

  const [aliceTka2, aliceTkb2, bobTka2, bobTkb2] = await Promise.all([
    getAssetBalance(tkaId, alice.address, alice.wallet),
    getAssetBalance(tkbId, alice.address, alice.wallet),
    getAssetBalance(tkaId, bob.address, bob.wallet),
    getAssetBalance(tkbId, bob.address, bob.wallet),
  ])
  console.log(`\nAfter:   Alice TKA ${aliceTka2} TKB ${aliceTkb2}   Bob TKA ${bobTka2} TKB ${bobTkb2}`)

  const clean = aliceTka2 === BigInt(TARGET) && aliceTkb2 === 0n && bobTka2 === 0n && bobTkb2 === BigInt(TARGET)
  console.log(clean ? '\n✓ Clean baseline restored.' : '\n⚠ Not a clean 500000/0 split — check manually.')
}

main().catch((err) => {
  console.error('\nRebalance failed:', err.message ?? err)
  process.exit(1)
})
