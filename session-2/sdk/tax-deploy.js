import 'dotenv/config'
import { VoyageProvider, Wallet, AssetFactory } from 'js-moi-sdk'
import manifest from '../coco/taxtoken.json' with { type: 'json' }

const provider = new VoyageProvider('devnet')
const wallet = await Wallet.fromMnemonic(process.env.MOI_MNEMONIC, "m/44'/6174'/7020'/0/0")
wallet.connect(provider)

const identifier = await wallet.getIdentifier()
const address = identifier.toString()
const TAX_BPS = 500 // 5%
const INITIAL_SUPPLY = 1_000_000

const ix = await AssetFactory.create(
  wallet, 'TaxToken', INITIAL_SUPPLY, address, true, manifest, 'Init',
  identifier.toBytes(), TAX_BPS, INITIAL_SUPPLY,
).send()
const [{ asset_id }] = await ix.result()

console.log('Successfully deployed TaxToken TAXED (1,000,000 max supply, 5% tax)')
console.log('  Treasury        :', address)
console.log('  Asset ID        :', asset_id)
console.log('  Interaction hash:', ix.hash)
console.log('\nSave this in .env as TAX_ASSET_ID')
