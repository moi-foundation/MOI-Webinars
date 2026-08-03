// Chain wiring shared by the agent-budget scripts. Self-contained: provider from
// MOI_NODE_URL, signing accounts from the resolver / user env entries, and
// the logic manifest fetched from chain by id (no local manifest file, no
// account pool). Also: asset-name resolution against the user's own holdings,
// per-tesseract log fetching, and a reusable newTesseracts WS subscription.

import { JsonRpcProvider, Wallet, getLogicDriver, KMOI_ASSET_ID } from "js-moi-sdk";
import websocketPkg from "websocket";
import {
    LOGIC_ID, MOI_NODE_URL, MOI_WEBSOCKET_URL, WS_RECONNECT_DELAY_MS,
    RESOLVER, USER,
} from "./env.js";
import { serializeError, toBigInt } from "./util.js";
import { decodeLog } from "./events.js";

const { w3cwebsocket: ChainWebSocket } = websocketPkg;

export const makeProvider = () => new JsonRpcProvider(MOI_NODE_URL);

// Build a signing wallet from a { mnemonic, derivationPath, subAccount } spec.
// subAccount === null/undefined → the primary account.
export const makeWallet = async (provider, spec) => {
    const wallet = await Wallet.fromMnemonic(spec.mnemonic, spec.derivationPath);
    if (spec.subAccount !== null && spec.subAccount !== undefined && Number.isFinite(spec.subAccount)) {
        wallet.setSubAccountId(spec.subAccount);
    }
    wallet.connect(provider);
    return wallet;
};

// ---------- Account / sub-account inspection ----------

export const getContextInfoOrNull = async (provider, id) => {
    try { return await provider.getContextInfo(id); } catch { return null; }
};

// An account's context links it to a logic when inherited_account matches or
// the logic appears among its storage_nodes.
export const contextMatchesLogic = (ctx, logicId) => {
    if (!ctx || !logicId) return false;
    if (ctx.inherited_account === logicId) return true;
    return Array.isArray(ctx.storage_nodes) && ctx.storage_nodes.includes(logicId);
};

export const getSubAccountCountOrZero = async (provider, id) => {
    try { return Number(await provider.getSubAccountCount(id)); }
    catch (err) {
        if (err?.message === "account not found" || err?.reason === "account not found") return 0;
        throw err;
    }
};

// All sub-accounts of `primarySpec` inherited under LOGIC_ID.
// Returns [{ index, address }] (possibly empty, possibly more than one — the
// chain permits a primary to inherit a logic at several indices, even though
// this CLI only ever creates one).
export const findInheritedAccounts = async (provider, primarySpec, primaryId) => {
    const count = await getSubAccountCountOrZero(provider, primaryId);
    const out = [];
    for (let index = 1; index <= count; index += 1) {
        const wallet = await makeWallet(provider, { ...primarySpec, subAccount: index });
        const address = String(await wallet.getIdentifier());
        const ctx = await getContextInfoOrNull(provider, address);
        if (contextMatchesLogic(ctx, LOGIC_ID)) out.push({ index, address: address.toLowerCase() });
    }
    return out;
};

// Select the single inherited account to act as.
//   pinnedIndex set  → that exact index must exist & be inherited, else throw
//   pinnedIndex null → exactly one inherited account must exist:
//                        0   → throw (tell the user to initialize)
//                        >1  → throw (tell the user to set USER_SUB_ACCOUNT)
// Returns { index, address }.
export const resolveInheritedAccount = async (provider, primarySpec, primaryId, pinnedIndex = null) => {
    if (pinnedIndex !== null && Number.isFinite(pinnedIndex)) {
        const wallet = await makeWallet(provider, { ...primarySpec, subAccount: pinnedIndex });
        const address = String(await wallet.getIdentifier()).toLowerCase();
        const ctx = await getContextInfoOrNull(provider, address);
        if (!contextMatchesLogic(ctx, LOGIC_ID)) {
            throw new Error(`USER_SUB_ACCOUNT=${pinnedIndex} (${address}) is not inherited under logic ${LOGIC_ID}. Provision an inherited sub-account first.`);
        }
        return { index: pinnedIndex, address };
    }
    const found = await findInheritedAccounts(provider, primarySpec, primaryId);
    if (found.length === 0) {
        throw new Error(`No sub-account inherited under logic ${LOGIC_ID} for ${primaryId}. Provision an inherited sub-account first.`);
    }
    if (found.length > 1) {
        const list = found.map((f) => `index ${f.index} (${f.address})`).join(", ");
        throw new Error(`Multiple inherited accounts under logic ${LOGIC_ID}: ${list}. Set USER_SUB_ACCOUNT to choose one.`);
    }
    return found[0];
};

// { provider, address, driver } for a given account spec. The manifest is
// fetched from chain (getLogicDriver), so no manifest file is needed. Used
// for the resolver, which signs as a primary account (no sub-account).
const loadAccount = async (spec, label) => {
    if (!spec.mnemonic) throw new Error(`Missing ${label} mnemonic in .env`);
    const provider = makeProvider();
    const wallet = await makeWallet(provider, spec);
    const address = String(await wallet.getIdentifier());
    if (spec.id && spec.id.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`${label} resolves to ${address} but .env declares ${spec.id} — check mnemonic / derivation / sub-account`);
    }
    const driver = await getLogicDriver(LOGIC_ID, wallet);
    return { provider, address: address.toLowerCase(), driver, wallet };
};

let resolverPromise;
export const loadResolver = () => (resolverPromise ??= loadAccount(RESOLVER, "resolver"));

// The user's signing account for ALL logic interactions is the sub-account
// inherited under LOGIC_ID — only inherited accounts may talk to the
// logic. The primary account (from the mnemonic) is used solely to derive /
// detect the inherited one; it never signs logic calls itself. The inherited
// index is taken from USER_SUB_ACCOUNT when set, otherwise detected
// on chain. Returns { provider, address (inherited), driver, primaryAddress, index }.
const loadUserInherited = async () => {
    if (!USER.mnemonic) throw new Error("Missing USER_MNEMONIC in .env");
    const provider = makeProvider();
    const base = { mnemonic: USER.mnemonic, derivationPath: USER.derivationPath };

    const primaryWallet = await makeWallet(provider, { ...base, subAccount: null });
    const primaryAddress = String(await primaryWallet.getIdentifier()).toLowerCase();
    if (USER.id && USER.id.toLowerCase() !== primaryAddress) {
        throw new Error(`Primary wallet resolves to ${primaryAddress} but USER_ID is ${USER.id}`);
    }

    const pinned = (USER.subAccount !== null && Number.isFinite(USER.subAccount)) ? USER.subAccount : null;
    const { index, address } = await resolveInheritedAccount(provider, base, primaryAddress, pinned);

    const wallet = await makeWallet(provider, { ...base, subAccount: index });
    const driver = await getLogicDriver(LOGIC_ID, wallet);
    return { provider, address, driver, wallet, primaryAddress, index };
};
let userPromise;
export const loadUser = () => (userPromise ??= loadUserInherited());

// Fuel is paid in KMOI and the chain reserves the FULL fuel_limit
// (fuel_price=1 × fuel_limit) up front — so an account can't submit an IX
// whose fuel_limit exceeds its KMOI balance, even when the op's real cost is
// tiny. Cap the requested fuel to the account's KMOI balance, and fail
// clearly when there's no KMOI to spend. Returns { fuelLimit, kmoi, capped }.
export const cappedFuel = async (provider, address, wantFuel) => {
    let kmoi = 0n;
    try { kmoi = toBigInt(String(await provider.getBalance(address, KMOI_ASSET_ID))); } catch { kmoi = 0n; }
    if (kmoi <= 0n) {
        throw new Error(`${address} has no KMOI to pay fuel. Fund it from your primary account.`);
    }
    const want = BigInt(wantFuel);
    const fuelLimit = kmoi < want ? Number(kmoi) : Number(want);
    return { fuelLimit, kmoi, capped: kmoi < want };
};

// ---------- Asset info + name resolution ----------

// moi.AssetInfoByAssetID — numeric fields come back hex-encoded.
export const fetchAssetInfo = async (assetId) => {
    const id = assetId.toLowerCase();
    const response = await fetch(MOI_NODE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0", id: `budget-asset-${id.slice(2, 10)}`,
            method: "moi.AssetInfoByAssetID",
            params: [{ asset_id: id, options: { tesseract_number: -1 } }],
        }),
    });
    const json = await response.json();
    if (json?.error) throw new Error(json.error?.message ?? JSON.stringify(json.error));
    const r = json?.result ?? {};
    const fromHex = (v) => (typeof v === "string" && v.startsWith("0x")) ? BigInt(v).toString() : (v ?? null);
    return {
        assetId: id,
        symbol: r.symbol ?? r.Symbol ?? null,
        decimals: r.decimals !== undefined ? Number(BigInt(r.decimals ?? "0x0")) : null,
        circulatingSupply: fromHex(r.circulating_supply ?? r.supply),
        maxSupply: fromHex(r.max_supply),
        creator: r.creator ?? r.Creator ?? null,
        manager: r.manager ?? r.Manager ?? null,
    };
};

// The assets a holder currently has, each annotated with its symbol.
// [{ assetId, amount, symbol }]
export const listHeldAssets = async (provider, holder) => {
    let tdu = [];
    try { tdu = await provider.getTDU(holder); } catch { tdu = []; }
    const out = [];
    for (const entry of tdu ?? []) {
        const assetId = String(entry.asset_id).toLowerCase();
        let symbol = null;
        try { symbol = (await fetchAssetInfo(assetId)).symbol; } catch { /* leave null */ }
        out.push({ assetId, amount: String(entry.amount ?? 0n), symbol });
    }
    return out;
};

// Resolve a user-supplied asset key against a holder's actual holdings.
//   * a full asset id (0x… 32 bytes) is returned as-is
//   * a symbol (e.g. "TKA") is matched, case-insensitively, against the
//     holder's assets; throws if absent or ambiguous
// Returns { assetId, symbol, amount } — `amount` only when it came from holdings.
export const resolveAssetKey = async (provider, holder, key) => {
    const raw = String(key ?? "").trim();
    if (raw === "") throw new Error("empty asset");
    if (raw.startsWith("0x")) {
        let symbol = null;
        try { symbol = (await fetchAssetInfo(raw)).symbol; } catch { /* ignore */ }
        return { assetId: raw.toLowerCase(), symbol, amount: null };
    }
    const held = await listHeldAssets(provider, holder);
    const matches = held.filter((a) => a.symbol && a.symbol.toUpperCase() === raw.toUpperCase());
    if (matches.length === 0) {
        const have = held.map((a) => a.symbol ?? a.assetId).join(", ") || "(none)";
        throw new Error(`Holder ${holder} has no asset named "${raw}". Held: ${have}. Pass a full 0x asset id instead.`);
    }
    if (matches.length > 1) {
        throw new Error(`Asset name "${raw}" is ambiguous for ${holder} (${matches.map((m) => m.assetId).join(", ")}). Pass the full 0x asset id.`);
    }
    return matches[0];
};

// ---------- Log fetching ----------

export const logsFromTesseract = async (provider, tesseract) => {
    const out = [];
    for (const participant of tesseract?.participants ?? []) {
        if (!participant?.id?.startsWith("0x00000000")) continue;
        const height = Number.parseInt(String(participant.height ?? "0x0"), 16);
        if (!Number.isFinite(height) || height === 0) continue;
        try {
            const chunk = await provider.getLogs({ id: participant.id, height: [height, height], topics: [] });
            for (const log of chunk ?? []) if (log?.logic_id === LOGIC_ID) out.push(log);
        } catch { /* skip participant */ }
    }
    return out;
};

export const fetchLogsForTesseract = async (provider, tsHash) => {
    const tesseract = await provider.getTesseract(true, true, { tesseract_hash: tsHash });
    return logsFromTesseract(provider, tesseract);
};

// Decoded logic events from a single ACCOUNT's own chain. One ranged getLogs
// over the account's full height. Historical reads must target a known sender;
// live discovery uses the WS subscription.
export const scanAccountOcsLogs = async (provider, accountId) => {
    let head;
    try {
        const meta = await provider.getAccountMetaInfo(accountId);
        head = Number.parseInt(String(meta?.height ?? "0x0"), 16);
    } catch { return []; }
    if (!Number.isFinite(head) || head < 0) return [];
    let logs;
    try { logs = await provider.getLogs({ id: accountId, height: [0, head], topics: [] }); }
    catch { return []; }
    const events = [];
    for (const log of logs ?? []) {
        if (log?.logic_id !== LOGIC_ID) continue;
        const decoded = decodeLog(log);
        if (decoded) events.push({ ...decoded, log });
    }
    return events;
};

// ---------- WS subscription ----------

const logKeyOf = (log) =>
    [log?.ts_hash ?? "", log?.ix_hash ?? "", JSON.stringify(log?.topics ?? []), log?.data ?? ""].join(":");

// Subscribe to newTesseracts and invoke onEvent({ eventName, decoded, log })
// for each new logic log. Handles the subscribe handshake, log dedup, and
// reconnection. Returns a handle with .close().
export const startChainSubscription = ({ provider, onEvent, onStatus = () => {}, onBatchDone = () => {} }) => {
    const SUBSCRIBE_ID = "budget-subscribe";
    const seen = new Set();
    const SEEN_CAP = 4000;
    let socket = null;
    let activeSub = null;
    let reconnectTimer = null;
    let closed = false;

    const remember = (key) => {
        if (!key || seen.has(key)) return true;
        seen.add(key);
        if (seen.size > SEEN_CAP) { seen.clear(); seen.add(key); }
        return false;
    };

    const handleMessage = async (raw) => {
        let msg; try { msg = JSON.parse(raw); } catch { return; }
        if (msg?.id === SUBSCRIBE_ID) {
            if (msg.result) { activeSub = msg.result; onStatus({ status: "subscribed", subscriptionId: msg.result }); }
            else onStatus({ status: "subscribe-failed", error: msg.error });
            return;
        }
        if (msg?.method !== "moi.subscription" || !msg.params) return;
        if (activeSub && msg.params.subscription !== activeSub) return;
        const tsHash = msg.params.result?.hash ?? msg.params.result?.tesseract_hash;
        if (!tsHash) return;
        let logs;
        try { logs = await fetchLogsForTesseract(provider, tsHash); }
        catch (err) { onStatus({ status: "fetch-error", tsHash, error: serializeError(err) }); return; }
        let any = false;
        for (const log of logs) {
            if (remember(logKeyOf(log))) continue;
            const decoded = decodeLog(log);
            if (!decoded) continue;
            any = true;
            try { await onEvent({ ...decoded, log }); }
            catch (err) { onStatus({ status: "handler-error", error: serializeError(err) }); }
        }
        if (any) { try { await onBatchDone(); } catch { /* ignore */ } }
    };

    const connect = () => {
        if (closed) return;
        activeSub = null;
        socket = new ChainWebSocket(MOI_WEBSOCKET_URL);
        socket.onopen = () => {
            onStatus({ status: "open", url: MOI_WEBSOCKET_URL });
            try {
                socket.send(JSON.stringify({ jsonrpc: "2.0", id: SUBSCRIBE_ID, method: "moi.Subscribe", params: ["newTesseracts"] }));
            } catch (err) { onStatus({ status: "subscribe-send-failed", error: serializeError(err) }); }
        };
        socket.onmessage = (m) => void handleMessage(m.data);
        socket.onerror = (e) => onStatus({ status: "error", error: serializeError(e) });
        socket.onclose = (e) => {
            onStatus({ status: "closed", code: e.code });
            activeSub = null;
            if (!closed) reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY_MS);
        };
    };

    connect();
    return { close: () => { closed = true; if (reconnectTimer) clearTimeout(reconnectTimer); try { socket?.close(); } catch { /* ignore */ } } };
};
