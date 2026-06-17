import { VoyageProvider, Wallet } from 'js-moi-sdk'
import { AgentRegistry } from 'js-moi-agent-registry'

function envRequired(name) {
  const v = process.env[name]
  if (!v || !v.trim()) throw new Error(`missing required env var: ${name}`)
  return v
}

async function main() {
  const mnemonic = envRequired('MOI_MNEMONIC')
  const derivationPath = process.env.MOI_DERIVATION_PATH ?? "m/44'/6174'/7020'/0/0"

  const provider = new VoyageProvider('devnet')
  const wallet = await Wallet.fromMnemonic(mnemonic, derivationPath)
  wallet.connect(provider)

  // No uploader is passed — discovery only ever issues read calls. SDK init
  // still requires a wallet to build the underlying logic driver, but no
  // signature is needed for getAllAgentIds / getAgentProfile.
  const registry = await AgentRegistry.init({ wallet })

  const total = await registry.getAgentCount()
  const ids = await registry.getAllAgentIds()
  console.log(`[discover] registry total: ${total}`)
  console.log(`[discover] enumerating ${ids.length} agent ids...\n`)

  for (const id of ids) {
    const { profile, found } = await registry.getAgentProfile(id)
    if (!found || !profile) {
      console.log(`${id}\t(profile not found — skipping)`)
      continue
    }
    console.log(`${profile.agent_id}\t[${profile.status}]`)
    console.log(`  owner       : 0x${profile.owner}`)
    console.log(`  agent_wallet: 0x${profile.agent_wallet}`)
    console.log(`  url         : ${profile.url}`)
    console.log()
  }
}

try {
  await main()
} catch (err) {
  console.error(`[error] ${err?.message ?? err}`)
  process.exit(1)
}
