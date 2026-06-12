import 'dotenv/config'
import { VoyageProvider, Wallet, getLogicDriver } from 'js-moi-sdk'

const logicId = process.argv[2] ?? process.env.LOGIC_ID
if (!logicId) throw new Error('Pass logic id as argv[2] or set LOGIC_ID in .env')

const provider = new VoyageProvider('devnet')
const wallet = await Wallet.fromMnemonic(process.env.MOI_MNEMONIC, "m/44'/6174'/7020'/0/0")
wallet.connect(provider)

const driver = await getLogicDriver(logicId, wallet)
const response = await driver.routines.Mode().call()
const { output, error } = await response.result()

if (error) throw new Error(error)

console.log('value:', output?.value)
