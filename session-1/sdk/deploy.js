import 'dotenv/config'
import { VoyageProvider, Wallet, LogicFactory } from 'js-moi-sdk'
import manifest from '../flipper/flipper.json' with { type: 'json' }

const provider = new VoyageProvider('devnet')
const wallet = await Wallet.fromMnemonic(process.env.MOI_MNEMONIC, "m/44'/6174'/7020'/0/0")
wallet.connect(provider)

const factory = new LogicFactory(manifest, wallet)
const ix = await factory.deploy('Init').send()
const { logic_id, error } = await ix.result()

if (error) throw new Error(error)

console.log('Interaction hash:', ix.hash)
console.log('Logic ID       :', logic_id)
console.log('\nSave this in .env as LOGIC_ID to run `node sdk/flip.js` / `node sdk/mode.js`.')
