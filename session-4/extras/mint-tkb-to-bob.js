import { env, loadBothWallets } from '../logic/wallets.js'
import { mintAsset } from '../logic/tokens.js'

const MINT_AMOUNT = 500_000
const tkbId = env('VITE_TKB_ASSET_ID')

async function main() {
  const { alice, bob } = await loadBothWallets()
  try {
    await alice.provider.getAccountMetaInfo(bob.address)
  } catch {
    console.error('\nBob is not on devnet yet. Fund at https://voyage.moi.technology')
    console.error(`Bob address: ${bob.address}\n`)
    process.exit(1)
  }

  console.log('\nMinting TKB to Bob…')
  await mintAsset(tkbId, alice.wallet, bob.address, MINT_AMOUNT)
  console.log('\nDone.\n')
}

main().catch((err) => {
  console.error('\nFailed:', err.message ?? err)
  process.exit(1)
})
