import 'dotenv/config'
import { VoyageProvider, Wallet, MAS0AssetLogic } from 'js-moi-sdk'

const provider = new VoyageProvider('devnet')
const wallet = await Wallet.fromMnemonic(process.env.MOI_MNEMONIC, "m/44'/6174'/7020'/0/0")
wallet.connect(provider)

const address = (await wallet.getIdentifier()).toString()

const ix = await MAS0AssetLogic.create(wallet, 'WEBINAR', 1_000_000, address, true).send()
const [{ asset_id }] = await ix.result()

console.log('Successfully created asset WEBINAR (1,000,000 supply)')
console.log('  Manager         :', address)
console.log('  Asset ID        :', asset_id)
console.log('  Interaction hash:', ix.hash)

const mintAmount = 100_000
const asset = new MAS0AssetLogic(asset_id, wallet)
const mintIx = await asset.mint(address, mintAmount).send()
await mintIx.result()

console.log(`\nMinted ${mintAmount.toLocaleString()} WEBINAR to manager`)
console.log('  Interaction hash:', mintIx.hash)
