// Logic event schemas + decoders, shared by chain helpers.

import { topicHash } from "js-moi-utils";
import { Document } from "js-polo";
import { hexToBytes, identifierString, toBigInt, toNumber } from "./util.js";

const identifierSchema = { kind: "bytes" };
const integerSchema = { kind: "integer" };
const boolSchema = { kind: "bool" };

export const EVENT_NAMES = [
    "IntentAnnounced", "IntentCancelled",
    "ProposalAccepted", "ProposalRejected", "ProposalExecuted",
    "ProposalAnnounced",
];
export const EVENT_TOPICS = Object.fromEntries(EVENT_NAMES.map((n) => [topicHash(n), n]));

export const EVENT_SCHEMAS = {
    IntentAnnounced: { kind: "struct", fields: {
        announced_at: integerSchema, expiry: integerSchema, intent_id: identifierSchema,
        min_receive_amount: integerSchema, offered_amount: integerSchema, offered_asset: identifierSchema,
        owner: identifierSchema, partial_fill_allowed: boolSchema,
        requested_asset: identifierSchema, status: integerSchema, nonce: integerSchema,
    }},
    IntentCancelled: { kind: "struct", fields: { intent_id: identifierSchema, owner: identifierSchema }},
    ProposalAccepted: { kind: "struct", fields: {
        accepted_at: integerSchema, owner: identifierSchema, proposal_hash: identifierSchema,
    }},
    ProposalRejected: { kind: "struct", fields: {
        accepted_at: integerSchema, owner: identifierSchema, proposal_hash: identifierSchema, rejected_at: integerSchema,
    }},
    ProposalExecuted: { kind: "struct", fields: {
        caller: identifierSchema, intent_count: integerSchema, proposal_hash: identifierSchema, transfer_count: integerSchema,
    }},
    // Coco emits topic fields (proposal_hash, announcer) ALSO into the data
    // document. topics[1..N] are signature-derived, NOT the field values, so
    // the data section is the only place the canonical proposal_hash lives.
    ProposalAnnounced: { kind: "struct", fields: {
        announcer: identifierSchema,
        intent_ids: { kind: "string" },
        intent_owners: { kind: "string" },
        proposal_hash: identifierSchema,
        resolver: identifierSchema,
        resolver_fee: { kind: "string" },
        submitted_at: integerSchema,
        transfers: { kind: "string" },
    }},
};

// { eventName, decoded } for a logic log, or null if it isn't one of ours.
export const decodeLog = (log) => {
    const topics = log?.topics ?? [];
    const eventName = topics.map((t) => EVENT_TOPICS[t]).find(Boolean);
    if (!eventName) return null;
    const schema = EVENT_SCHEMAS[eventName];
    const bytes = hexToBytes(log?.data);
    if (!schema || !bytes) return null;
    try { return { eventName, decoded: new Document(bytes, schema).getData() }; }
    catch { return null; }
};

// AnnounceProposal flattens arrays/structs to JSON-ish strings. intent_ids /
// intent_owners are valid JSON; transfers / resolver_fee are pseudo-JSON
// with bare 0x… tokens. Try strict JSON first, then quote bare hex tokens.
const QUOTE_BARE_HEX_RE = /([\s,:\[{])(0x[0-9a-fA-F]+)/g;
export const parseAnnouncedJson = (raw, fallback) => {
    if (typeof raw !== "string" || raw === "") return fallback;
    try { return JSON.parse(raw); } catch { /* pseudo-JSON */ }
    try { return JSON.parse(raw.replace(QUOTE_BARE_HEX_RE, (_, pre, hex) => `${pre}"${hex}"`)); }
    catch { return fallback; }
};

// Reconstruct the proposal payload (intent ids/owners, transfers, fee) from
// a decoded ProposalAnnounced event. `proposalHash` is the canonical hash
// read from the data section.
export const decodeProposalPayload = (decoded, proposalHash) => {
    if (!decoded || !proposalHash) return null;
    const intentIds = parseAnnouncedJson(decoded.intent_ids, []).map(identifierString);
    const intentOwners = parseAnnouncedJson(decoded.intent_owners, []).map(identifierString);
    const rawTransfers = parseAnnouncedJson(decoded.transfers, []);
    const transfers = (Array.isArray(rawTransfers) ? rawTransfers : []).map((t) => ({
        from: identifierString(t.from), to: identifierString(t.to),
        asset_id: identifierString(t.asset_id), amount: String(toBigInt(t.amount)),
    }));
    const rawFee = parseAnnouncedJson(decoded.resolver_fee, null);
    const resolverFee = rawFee ? {
        asset_id: identifierString(rawFee.asset_id), amount: String(toBigInt(rawFee.amount)),
    } : { asset_id: null, amount: "0" };
    return {
        hash: proposalHash, intentIds, intentOwners, transfers,
        resolver: identifierString(decoded.resolver), resolverFee,
        submittedAt: String(toBigInt(decoded.submitted_at)),
    };
};

// Normalize a decoded IntentAnnounced event into our in-memory intent shape.
export const normalizeIntent = (decoded) => ({
    intentId: identifierString(decoded.intent_id),
    owner: identifierString(decoded.owner),
    offeredAsset: identifierString(decoded.offered_asset)?.toLowerCase(),
    offeredAmount: String(toBigInt(decoded.offered_amount)),
    requestedAsset: identifierString(decoded.requested_asset)?.toLowerCase(),
    minReceiveAmount: String(toBigInt(decoded.min_receive_amount)),
    expiry: String(toBigInt(decoded.expiry)),
    partialFillAllowed: Boolean(decoded.partial_fill_allowed),
    remainingOfferAmount: String(toBigInt(decoded.offered_amount)),
    remainingMinReceiveAmount: String(toBigInt(decoded.min_receive_amount)),
    announcedAt: String(toBigInt(decoded.announced_at)),
    status: toNumber(decoded.status) || 1,
});
