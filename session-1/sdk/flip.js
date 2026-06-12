import 'dotenv/config'
import { VoyageProvider, Wallet, getLogicDriver } from 'js-moi-sdk'

const logicId = process.argv[2] ?? process.env.LOGIC_ID
if (!logicId) throw new Error('Pass logic id as argv[2] or set LOGIC_ID in .env')

const provider = new VoyageProvider('devnet')
const wallet = await Wallet.fromMnemonic(process.env.MOI_MNEMONIC, "m/44'/6174'/7020'/0/0")
wallet.connect(provider)

const driver = await getLogicDriver(logicId, wallet)
const ix = await driver.routines.Flip().send()
const { error } = await ix.result()

if (error) throw new Error(error)

console.log('Interaction hash:', ix.hash)
console.log('Flipped. Run `node sdk/mode.js` to read the new value.')
