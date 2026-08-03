#!/usr/bin/env node
/**
 * Smoke-tests the runtime-checkable claims in this skill against a local
 * js-moi-sdk checkout. Re-run whenever the SDK version bumps, then update
 * the "verified against" stamps in SKILL.md and references/.
 *
 * Usage: node verify-sdk.cjs [path-to-js-moi-sdk-repo]
 *        (repo must have node_modules installed: `npm install`)
 */
const path = require("path");
const fs = require("fs");

const sdkRoot = path.resolve(process.argv[2] ?? path.join(process.env.HOME, "js-moi-sdk"));
const sdk = require(path.join(sdkRoot, "node_modules", "js-moi-sdk"));

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fail++; console.log(`FAIL  ${label}`); }
};
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

(async () => {
  const {
    Wallet, HDNode, VERSION, MOI_DERIVATION_PATH, DEFAULT_FUEL_LIMIT, DEFAULT_FUEL_PRICE,
    ZERO_ADDRESS, KMOI_ASSET_ID, SARGA_ADDRESS,
    OpType, LockType, AssetStandard, AccountType, ReceiptStatus, Chain, ElementType,
    MAS0AssetLogic, MAS1AssetLogic, MAS2AssetLogic, AccountInherit, ParticipantCreate, AccountConfigure,
    Identifier, AssetId, createParticipantId, KramaId,
    JsonRpcProvider, WebsocketProvider, AbstractProvider, WebSocketEvent,
    ManifestCoder, ManifestCoderFormat, getLogicDriver, LogicFactory,
    hexToBN, numToHex, bytesToHex, encodeToString, topicHash, isValidAddress,
    toInteractionArgs, validateLogicPayload,
  } = sdk;

  console.log(`SDK VERSION constant: ${VERSION}\n`);

  console.log("— version & constants —");
  ok(VERSION === "0.7.1", `VERSION === "0.7.1" (got ${VERSION})`);
  ok(MOI_DERIVATION_PATH === "m/44'/6174'/0'/0/0", "MOI_DERIVATION_PATH");
  ok(DEFAULT_FUEL_PRICE === 1 && DEFAULT_FUEL_LIMIT === 10000, "DEFAULT_FUEL_PRICE=1, DEFAULT_FUEL_LIMIT=10000");
  ok(ZERO_ADDRESS === "0x" + "0".repeat(64), "ZERO_ADDRESS is 32-byte zero");
  ok(KMOI_ASSET_ID.startsWith("0x108"), "KMOI_ASSET_ID starts 0x108…");
  ok(typeof SARGA_ADDRESS === "string" && SARGA_ADDRESS.startsWith("0x20"), "SARGA_ADDRESS starts 0x20…");

  console.log("— keystore (new in 0.7.1) —");
  ok(typeof Wallet.fromKeystore === "function", "Wallet.fromKeystore exists");
  ok(typeof Wallet.prototype.generateKeystore === "function", "wallet.generateKeystore exists");
  ok(Wallet.fromPrivateKey === undefined, "Wallet.fromPrivateKey does NOT exist");
  ok(typeof HDNode.fromPrivateKey === "function", "HDNode.fromPrivateKey exists");

  const w = Wallet.createRandomSync();
  const primaryId = String(await w.getIdentifier());
  const ks = w.generateKeystore("hunter2");
  ok(ks.cipher === "aes-128-ctr" && ks.kdf === "scrypt", "keystore shape: aes-128-ctr + scrypt");
  ok(ks.id === primaryId, "keystore embeds plaintext participant id");
  const restored = Wallet.fromKeystore(JSON.stringify(ks), "hunter2");
  ok(String(await restored.getIdentifier()) === primaryId, "keystore roundtrip preserves identifier");
  ok(throws(() => Wallet.fromKeystore(ks, "wrong-password")), "wrong password throws");
  ok(throws(() => Wallet.fromKeystore(ks, "hunter2", { subAccountId: 2 })), "mismatched subAccountId throws");
  ok(restored.mnemonic === undefined, "restored wallet has no mnemonic (getter returns undefined)");

  console.log("— wallet / signer —");
  ok(Wallet.fromMnemonic.constructor.name === "AsyncFunction", "fromMnemonic is async");
  ok(typeof Wallet.fromMnemonicSync === "function" && typeof Wallet.createRandomSync === "function", "sync variants exist");
  ok(w.getAddress === undefined, "no getAddress() — use getIdentifier()");
  w.setSubAccountId(1);
  const subId = String(await w.getIdentifier());
  ok(subId.slice(0, 58) === primaryId.slice(0, 58) && subId.endsWith("00000001"), "sub-account = primary[0..28) + BE index");
  w.setSubAccountId(0);

  console.log("— asset wrappers —");
  const mas0Lower = ["mint", "mintWithMetadata", "burn", "transfer", "transferFrom", "approve", "revoke", "lockup", "release", "symbol", "balanceOf", "creator", "manager"];
  const mas0Upper = ["SetStaticMetadata", "SetDynamicMetadata", "Decimals", "MaxSupply", "CirculatingSupply", "GetStaticMetadata", "GetDynamicMetadata"];
  ok(mas0Lower.every(m => typeof MAS0AssetLogic.prototype[m] === "function"), "MAS0 lowercase methods exact casing");
  ok(mas0Upper.every(m => typeof MAS0AssetLogic.prototype[m] === "function"), "MAS0 uppercase methods exact casing");
  ok(typeof MAS0AssetLogic.newAsset === "function" && typeof MAS0AssetLogic.create === "function", "MAS0 statics newAsset/create");
  ok(typeof MAS1AssetLogic.prototype.isOwner === "function", "MAS1 has isOwner (tokenId-centric)");
  ok(MAS1AssetLogic.prototype.Decimals === undefined && MAS2AssetLogic.prototype.Decimals === undefined, "MAS1/MAS2 lack Decimals (do NOT mirror MAS0)");

  console.log("— builders —");
  ok(AccountInherit.prototype.send.length === 0, "AccountInherit.send() takes NO options (use .build().send(opt))");
  ok(typeof AccountInherit.prototype.build === "function", "AccountInherit.build exists");
  ok(typeof ParticipantCreate === "function" && typeof AccountConfigure === "function", "ParticipantCreate/AccountConfigure exported");

  console.log("— enums —");
  ok(OpType.PARTICIPANT_CREATE === 1 && OpType.ASSET_INVOKE === 5 && OpType.LOGIC_INVOKE === 12 && OpType.LOGIC_UPGRADE === 15, "OpType values");
  ok(LockType.MUTATE_LOCK === 0 && LockType.NO_LOCK === 2, "LockType values");
  ok(AssetStandard.MAS0 === 0 && AssetStandard.MASX === 65535, "AssetStandard incl. MASX=65535");
  ok(AccountType.SARGA_ACCOUNT === 0 && AccountType.LOGIC_ACCOUNT === 2 && AccountType.REGULAR_ACCOUNT === 4, "AccountType values");
  ok(ReceiptStatus.RECEIPT_Ok === 0 && ReceiptStatus.RECEIPT_INSUFFICIENT_FUEL === 2, "ReceiptStatus values");
  ok(Chain.TEST_NET === 111 && Chain.MAIN_NET === 113, "Chain values");
  ok(ElementType.ROUTINE === "callable", 'ElementType.ROUTINE === "callable"');
  ok(WebSocketEvent.NewLog === "newLog", 'WebSocketEvent.NewLog is singular "newLog" (subscribe with plural "newLogs")');

  console.log("— utils —");
  ok(hexToBN("0xff") === 255 && typeof hexToBN("0x" + "f".repeat(20)) === "bigint", "hexToBN: number ≤53 bits, else bigint");
  ok(numToHex(255) === "FF", "numToHex UPPERCASE, no 0x");
  ok(bytesToHex(new Uint8Array([171])) === "ab" && encodeToString(new Uint8Array([171])) === "0xab", "bytesToHex (no 0x) vs encodeToString (0x)");
  ok(/^0x[0-9a-f]{64}$/.test(topicHash("Transfer")), "topicHash → 0x + 64 hex");
  ok(isValidAddress(ZERO_ADDRESS) && !isValidAddress("0x1234"), "isValidAddress 32-byte check");
  ok(sdk.hexToBigInt === undefined && sdk.ensureHexPrefix === undefined && sdk.ZERO_HASH === undefined && sdk.setDefaultWordlist === undefined, "documented absences: hexToBigInt/ensureHexPrefix/ZERO_HASH/setDefaultWordlist");
  ok(sdk.setFlag === undefined && sdk.getFlag === undefined && sdk.flagMasks === undefined, "setFlag/getFlag/flagMasks NOT exported");
  ok(sdk.AssetDescriptor === undefined, "AssetDescriptor NOT exported");

  console.log("— identifiers —");
  const zid = new Identifier(ZERO_ADDRESS);
  ok(zid.getFingerprint().length === 24 && zid.getVariant() === 0, "fingerprint 24 bytes (4–27), variant BE");
  ok(typeof AssetId.validate === "function" && typeof AssetId.isValid === "function", "exported AssetId is the identifiers one (has validate/isValid)");
  ok(typeof createParticipantId === "function" && sdk.createAssetId === undefined && sdk.createLogicId === undefined, "only createParticipantId factory exists");
  ok(typeof KramaId.fromPrivateKey === "function" && typeof KramaId.validate === "function", "KramaId statics");

  console.log("— providers / manifest —");
  ok(typeof AbstractProvider === "function" && typeof JsonRpcProvider === "function" && typeof WebsocketProvider === "function", "provider classes exported");
  ok(typeof toInteractionArgs === "function" && typeof validateLogicPayload === "function", "serializers/validators incl. validateLogicPayload");
  ok(ManifestCoderFormat.JSON === "JSON" && ManifestCoderFormat.YAML === "YAML" && ManifestCoderFormat.POLO === undefined, "ManifestCoderFormat JSON/YAML only");
  ok(typeof getLogicDriver === "function" && typeof LogicFactory === "function" && typeof ManifestCoder === "function", "logic/manifest entry points exported");

  const fixture = path.join(sdkRoot, "packages/js-moi-manifest/manifests/tokenledger.json");
  if (fs.existsSync(fixture)) {
    const manifest = JSON.parse(fs.readFileSync(fixture, "utf8"));
    const kinds = new Set(manifest.elements.map(e => e.kind));
    ok(kinds.has("literal") && !kinds.has("constant"), 'manifest element kind is "literal", not "constant"');
    ok(manifest.engine.version !== undefined, "real manifests carry engine.version");
    const coder = new ManifestCoder(manifest);
    const someRoutine = manifest.elements.find(e => e.kind === "callable" && e.data.accepts?.length);
    if (someRoutine) {
      const args = someRoutine.data.accepts.map(f => (f.type === "string" ? "x" : f.type.startsWith("u") || f.type.startsWith("i") ? 1 : ZERO_ADDRESS));
      const calldata = coder.encodeArguments(someRoutine.data.name, ...args);
      const decoded = coder.decodeArguments(someRoutine.data.name, calldata);
      ok(Array.isArray(decoded), "decodeArguments returns a positional ARRAY");
    }
  } else {
    console.log("  skip manifest fixture checks (tokenledger.json not found)");
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL:", e); process.exit(1); });
