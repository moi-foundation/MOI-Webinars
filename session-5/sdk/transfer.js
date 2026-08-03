import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    VoyageProvider,
    Wallet,
    MAS1AssetLogic,
    KMOI_ASSET_ID,
} from "js-moi-sdk";
import { loadEnv } from "./env.js";

const sdkRoot = dirname(fileURLToPath(import.meta.url));

const RECIPIENT = "0x00000000a880f68bd4c82545a8d4b529c4ca07d35e08128b1e6192f700000000";

async function cappedFuel(provider, address, want) {
    const kmoi = BigInt(String(await provider.getBalance(address, KMOI_ASSET_ID)));
    if (kmoi <= 0n) throw new Error(`${address} has no KMOI for fuel`);
    const wantFuel = BigInt(want);
    return kmoi < wantFuel ? Number(kmoi) : Number(wantFuel);
}

function ownsToken(holdings, assetId, tokenId) {
    const entry = holdings.find(
        (h) => h.asset_id === assetId && Number(h.token_id) === Number(tokenId),
    );
    return entry && Number(entry.amount) >= 1;
}

const env = loadEnv();
const recipient =
    process.argv[2] ||
    process.env.RECIPIENT_ADDRESS?.trim() ||
    (env.recipient && env.recipient.trim()) ||
    RECIPIENT;

if (!/^0x[0-9a-fA-F]{64}$/.test(recipient)) {
    throw new Error("Invalid recipient address");
}

const { asset_id: assetId, token_id: tokenId } = JSON.parse(
    readFileSync(join(sdkRoot, "deployment.json"), "utf8"),
);

const provider = new VoyageProvider("devnet");
const wallet = await Wallet.fromMnemonic(env.mnemonic, env.keyPath);
wallet.connect(provider);

const sender = (await wallet.getIdentifier()).toHex();
console.log("Sender:", sender);
console.log("Recipient:", recipient);
console.log("Token ID:", tokenId);

const beforeSender = await provider.getTDU(sender);
const beforeRecipient = await provider.getTDU(recipient);

if (!ownsToken(beforeSender, assetId, tokenId)) {
    throw new Error(`Sender does not own token ${tokenId}. Run npm run mint first.`);
}

const transferFuel = await cappedFuel(provider, sender, 100_000);
const resp = await new MAS1AssetLogic(assetId, wallet)
    .transfer(Number(tokenId), recipient)
    .send({ fuel_limit: transferFuel });

const receipt = await resp.wait(120);
if (receipt.status !== 0) {
    const opErr = receipt.ix_operations?.find((op) => op.status !== 0);
    throw new Error(`transfer failed: status ${receipt.status}${opErr?.data?.error ? ` — ${opErr.data.error}` : ""}`);
}

console.log("Interaction hash:", resp.hash);

const afterSender = await provider.getTDU(sender);
const afterRecipient = await provider.getTDU(recipient);

const senderStillOwns = ownsToken(afterSender, assetId, tokenId);
const recipientOwns = ownsToken(afterRecipient, assetId, tokenId);

console.log("Sender still owns token:", senderStillOwns);
console.log("Recipient owns token:", recipientOwns);

if (!recipientOwns || senderStillOwns) {
    throw new Error("Ownership did not move as expected");
}

console.log("New owner:", recipient);
