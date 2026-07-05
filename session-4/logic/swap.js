// Browser-safe: imported by both the CLI and the UI. Keep dotenv/process.env out.
import { MAS0AssetLogic, getAssetDriver } from 'js-moi-sdk'

async function sendIx(label, ixPromise) {
  const ix = await ixPromise.send()
  await ix.result()
  console.log(`  ✓ ${label}  hash=${ix.hash}`)
  return ix.hash
}

// Direct MAS0 Transfer, account to account.
export async function transfer(assetId, wallet, beneficiary, amount) {
  const asset = new MAS0AssetLogic(assetId, wallet)
  return sendIx(`Transfer ${amount}`, asset.transfer(beneficiary, amount))
}

// Lock funds with the counterparty as beneficiary — an irrevocable on-chain
// offer: the locker cannot reclaim it, only the beneficiary can pull it.
export async function lockup(assetId, wallet, beneficiary, amount) {
  const asset = new MAS0AssetLogic(assetId, wallet)
  return sendIx(`Lockup ${amount}`, asset.lockup(beneficiary, amount))
}

export async function release(assetId, wallet, benefactor, beneficiary, amount) {
  const asset = new MAS0AssetLogic(assetId, wallet)
  return sendIx(`Release ${amount}`, asset.release(benefactor, beneficiary, amount))
}

// Claim what the counterparty locked for you. Must be signed by the
// beneficiary — verified on devnet: nobody else can move the locked funds.
//
// MAS0's release() has no on-chain guard: calling it when nothing is locked
// still "succeeds" but moves zero funds. So we check the balance delta
// ourselves and refuse to report success unless the claim actually landed —
// this is what makes "only goes through once both sides have locked" true.
export async function claim(assetId, wallet, benefactor, selfAddress, amount) {
  const before = await getAssetBalance(assetId, selfAddress, wallet)
  await release(assetId, wallet, benefactor, selfAddress, amount)
  const after = await getAssetBalance(assetId, selfAddress, wallet)
  if (after - before < BigInt(amount)) {
    throw new Error(`Nothing to claim — counterparty hasn't locked ${amount} for you yet.`)
  }
  return after
}

// getAssetDriver fetches the asset's logic manifest over RPC every call —
// cache drivers per signer so repeated balance refreshes skip that roundtrip.
const driverCache = new WeakMap()

async function cachedAssetDriver(assetId, signer) {
  let bySigner = driverCache.get(signer)
  if (!bySigner) {
    bySigner = new Map()
    driverCache.set(signer, bySigner)
  }
  if (!bySigner.has(assetId)) {
    bySigner.set(assetId, getAssetDriver(assetId, signer))
  }
  return bySigner.get(assetId)
}

export async function getAssetBalance(assetId, address, signer) {
  const driver = await cachedAssetDriver(assetId, signer)
  const { output, error } = await driver.routines.BalanceOf(address)
  if (error) {
    // Accounts that never held the asset (or hold exactly zero) report
    // "asset not found" / "token not found" — both mean a zero balance.
    const message = error.error ?? error.message ?? JSON.stringify(error)
    if (!/asset not found|token not found/.test(String(message))) {
      throw new Error(`BalanceOf failed: ${message}`)
    }
  }
  return BigInt(output?.balance ?? 0)
}

// moi.Lockups is a raw JSON-RPC method (not wrapped by js-moi-sdk's typed
// provider methods) that lists the lockups a given account has created —
// including who each one's beneficiary is. Unlike BalanceOf, it has no
// "query only your own state" restriction: any provider can look up any
// account's outstanding lockups. Verified on devnet.
export async function getLockups(provider, accountId) {
  const response = await provider.execute('moi.Lockups', {
    id: accountId,
    options: { tesseract_number: -1 },
  })
  const result = provider.processResponse(response)
  return (result ?? []).map((entry) => ({
    beneficiary: entry.id,
    assetId: entry.asset_id,
    amount: BigInt(entry.amount),
  }))
}

// The real, on-chain answer to "has the counterparty locked their side for
// me yet?" — reads chain state directly instead of guessing from a balance
// delta. This is what makes a pre-flight Claim gate actually possible.
export async function hasLockedForBeneficiary(provider, benefactor, beneficiary, assetId, amount) {
  const lockups = await getLockups(provider, benefactor)
  return lockups.some(
    (l) =>
      l.beneficiary.toLowerCase() === beneficiary.toLowerCase() &&
      l.assetId.toLowerCase() === assetId.toLowerCase() &&
      l.amount >= BigInt(amount),
  )
}
