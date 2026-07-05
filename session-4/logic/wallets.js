import 'dotenv/config'
import { VoyageProvider, Wallet } from 'js-moi-sdk'

// Voyage faucet derivation path — both demo wallets use it.
const DEFAULT_PATH = "m/44'/6174'/7020'/0/0"

export function env(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set — copy .env.example to .env`)
  return value
}

export function optionalEnv(name, fallback = '') {
  return process.env[name] ?? fallback
}

async function loadWallet(label, mnemonicEnv, pathEnv) {
  const mnemonic = env(mnemonicEnv)
  const path = optionalEnv(pathEnv, DEFAULT_PATH)
  const provider = new VoyageProvider('devnet')
  const wallet = await Wallet.fromMnemonic(mnemonic, path)
  wallet.connect(provider)
  const address = (await wallet.getIdentifier()).toHex()
  return { label, wallet, provider, address }
}

export async function loadBothWallets() {
  const [alice, bob] = await Promise.all([
    loadWallet('Alice', 'VITE_ALICE_MNEMONIC', 'VITE_ALICE_PATH'),
    loadWallet('Bob', 'VITE_BOB_MNEMONIC', 'VITE_BOB_PATH'),
  ])
  return { alice, bob }
}
