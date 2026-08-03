import dotenv from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sessionRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: join(sessionRoot, ".env") });

export function loadEnv() {
    const mnemonic = process.env.MOI_MNEMONIC;
    if (!mnemonic) {
        throw new Error("Set MOI_MNEMONIC in session-5/.env");
    }

    return {
        mnemonic,
        keyPath: process.env.MOI_KEY_PATH ?? "m/44'/6174'/7020'/0/0",
        symbol: process.env.NFT_SYMBOL ?? "ART",
        maxSupply: Number(process.env.NFT_MAX_SUPPLY ?? 10000),
        name: process.env.NFT_NAME ?? "Genesis #0",
        uri: process.env.NFT_URI ?? "ipfs://nft-marketplace/genesis-0",
        recipient: process.env.RECIPIENT_ADDRESS ?? "",
    };
}
