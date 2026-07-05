// Usage: node extras/fund-wallet.js "twelve word mnemonic …" [amount]
// Mints TKA and TKB (from Alice, the asset manager) to the given wallet.
import { VoyageProvider, Wallet } from 'js-moi-sdk'
import { env, loadBothWallets } from '../logic/wallets.js'
import { mintAsset } from '../logic/tokens.js'
import { getAssetBalance } from '../logic/swap.js'

const DERIVATION_PATH = "m/44'/6174'/7020'/0/0"

const mnemonic = process.argv[2]
const amount = Number(process.argv[3] ?? 500_000)
if (!mnemonic) {
  console.error('Usage: node extras/fund-wallet.js "twelve word mnemonic …" [amount]')
  process.exit(1)
}

const tkaId = env('VITE_TKA_ASSET_ID')
const tkbId = env('VITE_TKB_ASSET_ID')

async function main() {
  const target = await Wallet.fromMnemonic(mnemonic.trim(), DERIVATION_PATH)
  target.connect(new VoyageProvider('devnet'))
  const targetAddress = (await target.getIdentifier()).toHex()
  console.log(`\nTarget wallet: ${targetAddress}`)

  const { alice } = await loadBothWallets()

  try {
    await alice.provider.getAccountMetaInfo(targetAddress)
  } catch {
    console.error('\nTarget is not on devnet yet. Fund it at https://voyage.moi.technology first.\n')
    process.exit(1)
  }

  console.log(`\nMinting ${amount} TKA and ${amount} TKB…`)
  await mintAsset(tkaId, alice.wallet, targetAddress, amount)
  await mintAsset(tkbId, alice.wallet, targetAddress, amount)

  const [tka, tkb] = await Promise.all([
    getAssetBalance(tkaId, targetAddress, target),
    getAssetBalance(tkbId, targetAddress, target),
  ])
  console.log(`\nBalances now:  TKA ${tka}  TKB ${tkb}\n`)
}

main().catch((err) => {
  console.error('\nFailed:', err.message ?? err)
  process.exit(1)
})
