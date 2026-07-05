import { writeFileSync, existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadBothWallets, optionalEnv } from '../logic/wallets.js'
import { deployAsset, mintAsset } from '../logic/tokens.js'
import { getAssetBalance } from '../logic/swap.js'

const STATE_DIR = dirname(fileURLToPath(import.meta.url))
const ENV_FILE = join(STATE_DIR, '..', '.env')

const SUPPLY = 1_000_000
const MINT_AMOUNT = 500_000

async function printNativeHint(label, provider, address) {
  try {
    const meta = await provider.getAccountMetaInfo(address)
    console.log(`  ${label.padEnd(8)} account on devnet: yes (height ${meta.height})`)
    return true
  } catch {
    console.log(`  ${label.padEnd(8)} account on devnet: not found — fund at https://voyage.moi.technology`)
    return false
  }
}

function appendEnvVars(vars) {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : ''
  for (const [key, value] of Object.entries(vars)) {
    const re = new RegExp(`^${key}=.*$`, 'm')
    const line = `${key}=${value}`
    content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`
  }
  writeFileSync(ENV_FILE, content)
}

async function main() {
  console.log('\n=== Session 4 Setup — TKA / TKB test assets ===\n')

  const { alice, bob } = await loadBothWallets()

  console.log('Wallets')
  console.log(`  Alice    ${alice.address}`)
  console.log(`  Bob      ${bob.address}`)

  console.log('\nDevnet accounts')
  const aliceOk = await printNativeHint('Alice', alice.provider, alice.address)
  const bobOk = await printNativeHint('Bob', bob.provider, bob.address)

  if (!aliceOk) {
    console.log('\n⚠ Alice must be funded before setup can deploy assets.')
    console.log('  Fund at https://voyage.moi.technology then re-run: npm run setup')
    process.exit(1)
  }

  if (!bobOk) {
    console.log('\n⚠ Bob is not on devnet yet.')
    console.log('  Fund Bob\'s address at https://voyage.moi.technology before swap-cli.js transfer-bob.')
    console.log('  Setup will still deploy/mint TKB to Bob\'s address (Alice pays gas).')
  }

  let tkaId = optionalEnv('VITE_TKA_ASSET_ID')
  let tkbId = optionalEnv('VITE_TKB_ASSET_ID')

  if (tkaId && tkbId) {
    console.log('\nReusing existing asset IDs from .env')
  } else {
    console.log('\nDeploying MAS0 assets on devnet…')
    if (!tkaId) {
      tkaId = await deployAsset(alice.wallet, 'TKA', SUPPLY, alice.address)
      await mintAsset(tkaId, alice.wallet, alice.address, MINT_AMOUNT)
    }
    if (!tkbId) {
      tkbId = await deployAsset(alice.wallet, 'TKB', SUPPLY, alice.address)
      if (bobOk) {
        await mintAsset(tkbId, alice.wallet, bob.address, MINT_AMOUNT)
      } else {
        console.log('\n  ⚠ Skipping TKB mint to Bob — fund Bob first, then run:')
        console.log(`     node scripts/mint-tkb-to-bob.js`)
        await mintAsset(tkbId, alice.wallet, alice.address, MINT_AMOUNT)
        console.log('  (Minted TKB to Alice temporarily — transfer to Bob after he is funded.)')
      }
    }
  }

  appendEnvVars({
    VITE_TKA_ASSET_ID: tkaId,
    VITE_TKB_ASSET_ID: tkbId,
  })

  console.log('\nAsset IDs (saved to .env)')
  console.log(`  VITE_TKA_ASSET_ID=${tkaId}`)
  console.log(`  VITE_TKB_ASSET_ID=${tkbId}`)

  console.log('\nToken balances after setup')
  const rows = await Promise.all([
    ['Alice TKA', tkaId, alice],
    ['Alice TKB', tkbId, alice],
    ['Bob TKA', tkaId, bob],
    ['Bob TKB', tkbId, bob],
  ].map(async ([label, assetId, who]) => {
    try {
      const balance = await getAssetBalance(assetId, who.address, who.wallet)
      return [label, balance]
    } catch {
      return [label, null]
    }
  }))
  for (const [label, balance] of rows) {
    if (balance != null) console.log(`  ${label.padEnd(10)} ${balance}`)
    else console.log(`  ${label.padEnd(10)} (account not on devnet)`)
  }

  console.log('\nNext: node extras/swap-cli.js lock-alice\n')
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message ?? err)
  process.exit(1)
})
