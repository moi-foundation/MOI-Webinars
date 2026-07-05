import { MAS0AssetLogic } from 'js-moi-sdk'

export async function deployAsset(wallet, symbol, supply, manager) {
  const ix = await MAS0AssetLogic.create(wallet, symbol, supply, manager, true).send()
  const [{ asset_id }] = await ix.result()
  console.log(`  ✓ Deployed ${symbol}  asset_id=${asset_id}  hash=${ix.hash}`)
  return asset_id
}

export async function mintAsset(assetId, wallet, beneficiary, amount) {
  const asset = new MAS0AssetLogic(assetId, wallet)
  const ix = await asset.mint(beneficiary, amount).send()
  await ix.result()
  console.log(`  ✓ Mint ${amount} → ${beneficiary.slice(0, 10)}…  hash=${ix.hash}`)
  return ix.hash
}
