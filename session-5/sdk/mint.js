import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    AssetFactory,
    VoyageProvider,
    Wallet,
    getAssetDriver,
    KMOI_ASSET_ID,
} from "js-moi-sdk";
import { loadEnv } from "./env.js";

const sdkRoot = dirname(fileURLToPath(import.meta.url));
const sessionRoot = join(sdkRoot, "..");

async function cappedFuel(provider, address, want) {
    const kmoi = BigInt(String(await provider.getBalance(address, KMOI_ASSET_ID)));
    if (kmoi <= 0n) throw new Error(`${address} has no KMOI for fuel`);
    const wantFuel = BigInt(want);
    return kmoi < wantFuel ? Number(kmoi) : Number(wantFuel);
}

async function assertOk(label, resp) {
    const receipt = await resp.wait(120);
    if (receipt.status !== 0) {
        throw new Error(`${label} failed: receipt status ${receipt.status}`);
    }
    for (const op of receipt.ix_operations ?? []) {
        if (op.status !== 0) {
            throw new Error(`${label} op failed: status ${op.status}`);
        }
    }
}

const env = loadEnv();
const manifest = JSON.parse(
    readFileSync(join(sessionRoot, "coco/mas1.json"), "utf8"),
);

const provider = new VoyageProvider("devnet");
const wallet = await Wallet.fromMnemonic(env.mnemonic, env.keyPath);
wallet.connect(provider);

const owner = (await wallet.getIdentifier()).toHex();
console.log("Owner:", owner);

const createFuel = await cappedFuel(provider, owner, 500_000);
const createResp = await AssetFactory.create(
    wallet,
    env.symbol,
    env.maxSupply,
    owner,
    true,
    manifest,
    "Init",
).send({ fuel_limit: createFuel });

await assertOk("create", createResp);

const assetId = (await createResp.result())[0].asset_id;
console.log("Asset ID:", assetId);

const driver = await getAssetDriver(assetId, wallet);
const mintResp = await driver.routines.Mint(owner, env.name, env.uri);
await assertOk("mint", mintResp);

const { output } = await mintResp.result();
const tokenId = output?.token_id ?? 0;

console.log("Interaction hash:", mintResp.hash);
console.log("Token ID:", tokenId);

writeFileSync(
    join(sdkRoot, "deployment.json"),
    JSON.stringify({ asset_id: assetId, token_id: tokenId, owner }, null, 2),
);
