// Shared low-level helpers for the agent-budget scripts. Importing this module
// also installs the js-polo readUInt patch (side effect) — without it 7-8
// byte integers (our nanosecond timestamps) round-trip through Number and
// lose their low bits, which makes ComputeProposalHash diverge on chain.

import { ReadBuffer } from "js-polo/dist/readbuffer.js";

if (ReadBuffer?.prototype?.readUInt && !ReadBuffer.prototype.__u256Patched) {
    const orig = ReadBuffer.prototype.readUInt;
    ReadBuffer.prototype.readUInt = function (data) {
        if (data.length <= 6) return orig.call(this, data);
        return BigInt("0x" + Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join(""));
    };
    ReadBuffer.prototype.__u256Patched = true;
}

export const ZERO_HASH = "0x" + "0".repeat(64);
export const NS_PER_MS = 1_000_000n;
export const NS_PER_SEC = 1_000_000_000n;

export const hexToBytes = (data) => {
    if (typeof data !== "string" || !data.startsWith("0x")) return null;
    const hex = data.slice(2);
    if (hex.length === 0 || hex.length % 2 !== 0) return null;
    return new Uint8Array(hex.match(/../g).map((b) => parseInt(b, 16)));
};

export const identifierString = (value) => {
    if (typeof value === "string") return value.startsWith("0x") ? value.toLowerCase() : `0x${value.toLowerCase()}`;
    if (typeof value === "bigint") return `0x${value.toString(16).padStart(64, "0")}`;
    if (value instanceof Uint8Array) return `0x${[...value].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    if (Array.isArray(value)) return `0x${value.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    return null;
};

// u256 / Identifier slots want a fixed 32-byte big-endian Uint8Array.
export const u256bytes = (value) => {
    if (value instanceof Uint8Array && value.length === 32) return value;
    let big;
    if (typeof value === "bigint") big = value;
    else if (typeof value === "string") big = BigInt(value);
    else big = BigInt(value);
    const hex = big.toString(16).padStart(64, "0");
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
};

export const toBigInt = (value, fallback = 0n) => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string") return value ? BigInt(value) : fallback;
    if (value instanceof Uint8Array || Array.isArray(value)) {
        if (value.length === 0) return fallback;
        return BigInt("0x" + [...value].map((b) => Number(b).toString(16).padStart(2, "0")).join(""));
    }
    return fallback;
};

export const toNumber = (value, fallback = 0) => Number(toBigInt(value, BigInt(fallback)));
export const nowNs = () => BigInt(Date.now()) * NS_PER_MS;
export const serializeError = (err) => err?.message ?? String(err);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const fmtHash = (h) => (typeof h === "string" && h.length > 18) ? `${h.slice(0, 10)}…${h.slice(-6)}` : (h ?? "—");

// JSON.stringify replacer that renders BigInt as a decimal string.
export const bigintReplacer = (_, v) => typeof v === "bigint" ? v.toString() : v;
