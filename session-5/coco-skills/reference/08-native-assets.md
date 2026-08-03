# 08 — Native Assets

The MOI protocol includes a built-in **asset engine** — the only way to create and manage programmable assets (tokens, NFTs). This provides protocol-level safety guarantees for all asset operations.

## Asset Logic

Asset logics are special logics declared with `coco asset` that interact with the asset engine via the `asset` global.

**Asset logics are never deployed — assets are created from them.** An asset logic is a *template*: once compiled, it is **attached to an asset instance via the `create` Cocolab command**, not via `deploy`. `create` registers a new asset, sets its properties (symbol, decimals, manager, max_supply, enable_events), and makes the Sender its creator and manager.

- **Never use `deploy <Asset>.Init()`** on an asset logic — it will not work.
- **Always use `create <Asset>(...)`** to instantiate the asset.
- **MAS0 needs no init call at all** — there is no `Init` endpoint. Go straight from `create` to `Mint`/`Transfer`/etc.
- **MAS1 and MAS2 require `invoke <Asset>.Init() as <creator>` immediately after `create`, before any other call.** They track an auto-incrementing token counter in dynamic metadata; the source declares `endpoint deploy Init():` purely so the counter can be bootstrapped. Skipping it makes the very first `Mint` fail with `error: invalid key` (because `get_token_count` depolorizes an empty value). Use `invoke`, never `deploy`.

## MOI Asset Standards

MOI ships three reference asset standards — **MAS0**, **MAS1**, and **MAS2** — analogous to Ethereum's ERC-20, ERC-721, and ERC-1155. Each is a complete, drop-in asset logic: for any asset that conforms to one of these standards you do **not** need to write new code at all — compile the corresponding `.coco` file and use the `create` Cocolab command to configure the per-asset properties (symbol, decimals, manager, max_supply, enable_events). The Sender of `create` becomes the asset's creator and manager by default.

**Ready-to-use sources** (compile and `create` without modification) live under `coco-skills/standards/`. Each standard is its own compilable mini-project (`.coco` source + `coco.nut`): `cd` into the folder and run `coco compile` to produce the manifest.

| Standard | Type | Equivalent | Full source | `token_id` | `amount` | Post-`create` init |
|----------|------|-----------|-------------|------------|----------|--------------------|
| **MAS0** | Fungible | ERC-20 | [`standards/mas0/mas0.coco`](../standards/mas0/mas0.coco) | Always `0` | Variable U256 | None |
| **MAS1** | Non-fungible | ERC-721 | [`standards/mas1/mas1.coco`](../standards/mas1/mas1.coco) | Auto-incrementing | Always `U256(1)` | `invoke MAS1.Init()` (token counter) |
| **MAS2** | Semi-fungible | ERC-1155 | [`standards/mas2/mas2.coco`](../standards/mas2/mas2.coco) | Auto-incrementing | Variable U256 | `invoke MAS2.Init()` (token counter) |

**When to copy vs. when to extend:** if your asset only needs standard behaviour (transfers, approvals, mint/burn, metadata), copy one of these files verbatim and `compile` it. Only write a custom asset logic when you need non-standard rules (e.g. fee on transfer, restricted minting, supply caps enforced in code rather than by `max_supply`).

### Using a MAS standard as-is

For a standard fungible token, the whole workflow is:

```bash
# 1. Use the drop-in standard project (or copy standards/mas0/mas0.coco into your own project).
cd coco-skills/standards/mas0
# 2. Compile it to produce the manifest (mas0.yaml by default, per coco.nut [target.moi]).
coco compile
```

```
# 3. In Cocolab, load the compiled manifest and use it. No custom code required.
#    Always load logics via `from manifest(<file>)` — the bare `compile <Name>`
#    and `from coco(...)` forms are not reliable.
coco lab start
> register alice
> register bob
> compile MAS0 from manifest(mas0.yaml)
> create MAS0(symbol: "BTC", decimals: 18, manager: alice, max_supply: 1000000, enable_events: true) as alice
> invoke MAS0.Mint(beneficiary: alice, amount: 1000) as alice
> invoke MAS0.Transfer(beneficiary: bob, amount: 10) as alice
> invoke MAS0.BalanceOf(address: alice)
```

**MAS1** (NFT) and **MAS2** (SFT) follow the same shape but **require** an `invoke <Asset>.Init() as <creator>` call right after `create` to seed the token counter. Skipping it causes the first `Mint` to fail with `error: invalid key`. **Never** use `deploy <Asset>.Init()` on an asset logic — the logic is not deployed, it is attached to an asset via `create`.

```
# MAS1 — ERC-721-style NFT
coco lab start
> register alice
> register bob
> compile MAS1 from manifest(mas1.yaml)
> create MAS1(symbol: "ART", decimals: 0, manager: alice, max_supply: 1000, enable_events: true) as alice
> invoke MAS1.Init() as alice                        # initialize token counter (NOT deploy)
> invoke MAS1.Mint(beneficiary: alice) as alice      # → token_id: 0
> invoke MAS1.Mint(beneficiary: bob) as alice        # → token_id: 1
> invoke MAS1.Transfer(token_id: 0, beneficiary: bob) as alice
> invoke MAS1.IsOwner(token_id: 0, address: bob)
```

```
# MAS2 — ERC-1155-style SFT
coco lab start
> register alice
> register bob
> compile MAS2 from manifest(mas2.yaml)
> create MAS2(symbol: "ITEM", decimals: 0, manager: alice, max_supply: 1000000, enable_events: true) as alice
> invoke MAS2.Init() as alice                                      # initialize token counter (NOT deploy)
> invoke MAS2.Mint(beneficiary: alice, amount: 100) as alice       # → token_id: 0, 100 units
> invoke MAS2.Mint(beneficiary: alice, amount: 50)  as alice       # → token_id: 1,  50 units
> invoke MAS2.Transfer(token_id: 0, beneficiary: bob, amount: 10) as alice
> invoke MAS2.BalanceOf(token_id: 0, address: bob)
```

### MAS0 — Fungible Token (ERC-20)

Abbreviated view — see [`standards/mas0/mas0.coco`](../standards/mas0/mas0.coco) for the complete, compilable source.

```coco
coco asset MAS0

event AssetEvent:
    topic operation String
    field operator Identifier
    field benefactor Identifier
    field beneficiary Identifier
    field amount U256
    field expires_at U64

// --- Transfers ---
endpoint Transfer(beneficiary Identifier, amount U256):
    if asset.EnableEvents():
        emit AssetEvent{operation: "Transfer", operator: Sender, benefactor: Sender,
            beneficiary: beneficiary, amount: amount}
    asset.Transfer(token_id: 0, beneficiary, amount)

endpoint TransferFrom(benefactor, beneficiary Identifier, amount U256):
    if asset.EnableEvents():
        emit AssetEvent{operation: "TransferFrom", operator: Sender, benefactor: benefactor,
            beneficiary: beneficiary, amount: amount}
    asset.TransferFrom(token_id: 0, benefactor, beneficiary, amount)

// --- Minting & Burning ---
endpoint dynamic Mint(beneficiary Identifier, amount U256):
    if asset.EnableEvents():
        emit AssetEvent{operation: "Mint", operator: Sender, beneficiary: beneficiary,
            amount: amount}
    asset.Mint(token_id: 0, beneficiary, amount)

endpoint dynamic Burn(amount U256):
    if asset.EnableEvents():
        emit AssetEvent{operation: "Burn", operator: Sender, benefactor: Sender,
            amount: amount}
    asset.Burn(token_id: 0, amount)

// --- Approvals ---
endpoint Approve(beneficiary Identifier, amount U256, expires_at U64):
    if asset.EnableEvents():
        emit AssetEvent{operation: "Approve", operator: Sender, benefactor: Sender,
            beneficiary: beneficiary, amount: amount, expires_at: expires_at}
    asset.Approve(token_id: 0, beneficiary, amount, expires_at)

endpoint Revoke(beneficiary Identifier):
    if asset.EnableEvents():
        emit AssetEvent{operation: "Revoke", operator: Sender, benefactor: Sender,
            beneficiary: beneficiary}
    asset.Revoke(token_id: 0, beneficiary)

// --- Queries ---
endpoint Symbol() -> (symbol String):
    symbol = asset.Symbol()

endpoint BalanceOf(address Identifier) -> (balance U256):
    balance = asset.BalanceOf(token_id: 0, address)

endpoint Creator() -> (creator Identifier):
    creator = asset.Creator()

endpoint Manager() -> (manager Identifier):
    manager = asset.Manager()

endpoint Decimals() -> (decimals U64):
    decimals = asset.Decimals()

endpoint MaxSupply() -> (max_supply U256):
    max_supply = asset.MaxSupply()

endpoint CirculatingSupply() -> (circulating_supply U256):
    circulating_supply = asset.CirculatingSupply()

// --- Metadata ---
endpoint dynamic SetStaticMetadata(key String, value Bytes):
    asset.SetStaticMetadata(key, value)

endpoint dynamic SetDynamicMetadata(key String, value Bytes):
    asset.SetDynamicMetadata(key, value)

endpoint GetStaticMetadata(key String) -> (value Bytes):
    value = asset.GetStaticMetadata(key)

endpoint GetDynamicMetadata(key String) -> (value Bytes):
    value = asset.GetDynamicMetadata(key)
```

**Testing in Cocolab — basic mint and transfer:**
```
coco lab start
> register alice
> register bob
> set default.sender alice
> compile AnAsset from manifest(standards/mas0/mas0.yaml)
> create AnAsset(symbol: "BTC", decimals: 18, manager: alice, max_supply: 1000000, enable_events: true) as alice
> invoke AnAsset.Mint(beneficiary: alice, amount: 1000) as alice
> invoke AnAsset.Transfer(beneficiary: bob, amount: 10) as alice
> invoke AnAsset.BalanceOf(address: alice)
  Execution Outputs ||| balance:990
> invoke AnAsset.BalanceOf(address: bob)
  Execution Outputs ||| balance:10
```

**Testing Approve + TransferFrom pattern:**

In Cocolab, `TransferFrom` only works as a **2-party operation** where the operator is also the beneficiary. The 3-party case (operator != beneficiary) is not supported in Cocolab.

```
> invoke AnAsset.Approve(beneficiary: bob, amount: 200, expires_at: 9999999999) as alice
> invoke AnAsset.TransferFrom(benefactor: alice, beneficiary: bob, amount: 100) as bob
> invoke AnAsset.BalanceOf(address: alice)
  Execution Outputs ||| balance:890
> invoke AnAsset.BalanceOf(address: bob)
  Execution Outputs ||| balance:110
```

In this pattern: alice approves bob to spend up to 200 of her tokens. Bob then pulls 100 from alice to himself using `TransferFrom` — bob is both the operator (`as bob`) and the beneficiary.

> **Limitation:** 3-party TransferFrom (where operator, benefactor, and beneficiary are all different actors) does not work in Cocolab, even with `with` participants. Only the 2-party case (operator = beneficiary) is supported.

### MAS1 — Non-Fungible Token (ERC-721)

Each mint creates a new `token_id` (auto-incrementing). Amount is always `U256(1)`. Token count is tracked via dynamic metadata. Abbreviated view — see [`standards/mas1/mas1.coco`](../standards/mas1/mas1.coco) for the complete, compilable source. Key differences from MAS0:

```coco
coco asset MAS1

const TOKEN_COUNT String = "__token_count__"

function get_token_count() -> (token_count U64):
    memory value = asset.GetDynamicMetadata(key: TOKEN_COUNT)
    token_count = depolorize(U64, value)

function dynamic set_token_count(token_count U64):
    asset.SetDynamicMetadata(key: TOKEN_COUNT, polorize(token_count))

endpoint deploy Init():
    set_token_count(token_count: 0)

endpoint dynamic Mint(beneficiary Identifier) -> (token_id U64):
    memory new_token_id = (token_count) <- get_token_count()
    if asset.EnableEvents():
        emit AssetEvent{operation: "Mint", token_id: new_token_id, operator: Sender, beneficiary: beneficiary}
    asset.Mint(token_id: new_token_id, beneficiary, amount: U256(1))
    set_token_count(token_count: new_token_id+1)
    token_id = new_token_id

endpoint IsOwner(token_id U64, address Identifier) -> (is_owner Bool):
    is_owner = asset.BalanceOf(token_id, address) > 0

// Per-token metadata with ownership check
endpoint dynamic SetDynamicTokenMetadata(token_id U64, key String, value Bytes):
    if asset.BalanceOf(token_id, Sender) == 0:
        throw "only token owner can set token metadata"
    asset.SetDynamicTokenMetadata(token_id, key, value)
```

### MAS2 — Semi-Fungible Token (ERC-1155)

Like MAS1 but with variable amounts per token. Combines fungible and non-fungible properties. Abbreviated view — see [`standards/mas2/mas2.coco`](../standards/mas2/mas2.coco) for the complete, compilable source:

```coco
coco asset MAS2

// Same token counter pattern as MAS1, but Mint takes an amount:
endpoint dynamic Mint(beneficiary Identifier, amount U256) -> (token_id U64):
    memory new_token_id = (token_count) <- get_token_count()
    if asset.EnableEvents():
        emit AssetEvent{operation: "Mint", token_id: new_token_id, operator: Sender, beneficiary: beneficiary}
    asset.Mint(token_id: new_token_id, beneficiary, amount)
    set_token_count(token_count: new_token_id+1)
    token_id = new_token_id

// Transfer and Burn also take amount (unlike MAS1 which is always 1)
endpoint Transfer(token_id U64, beneficiary Identifier, amount U256):
    asset.Transfer(token_id, beneficiary, amount)

endpoint BalanceOf(token_id U64, address Identifier) -> (balance U256):
    balance = asset.BalanceOf(token_id, address)
```

## The `asset` Global

Only available in asset logics (`coco asset`). Provides access to the **asset engine**.

Asset properties (symbol, decimals, manager, etc.) are defined when creating the asset via the `create` Cocolab command, not through code.

### Transfers & Ownership

| Method | Signature | Description |
|--------|-----------|-------------|
| `asset.Transfer(...)` | `(token_id U64, beneficiary Identifier, amount U256)` | Transfer from Sender to beneficiary |
| `asset.TransferFrom(...)` | `(token_id U64, benefactor Identifier, beneficiary Identifier, amount U256)` | Transfer from benefactor to beneficiary (requires approval) |
| `asset.Mint(...)` | `(token_id U64, beneficiary Identifier, amount U256)` | Mint new tokens to beneficiary |
| `asset.MintWithMetadata(...)` | `(token_id U64, beneficiary Identifier, amount U256, static_metadata Map[String]Bytes)` | Mint with attached metadata |
| `asset.Burn(...)` | `(token_id U64, amount U256)` | Burn tokens from Sender |
| `asset.Lockup(...)` | `(token_id U64, beneficiary Identifier, amount U256)` | Lock tokens for beneficiary |
| `asset.Release(...)` | `(token_id U64, benefactor Identifier, beneficiary Identifier, amount U256)` | Release locked tokens |
| `asset.Approve(...)` | `(token_id U64, beneficiary Identifier, amount U256, expires_at U64)` | Approve beneficiary to spend up to amount until expires_at |
| `asset.Revoke(...)` | `(token_id U64, beneficiary Identifier)` | Revoke a previous approval |

### Queries

| Method | Returns | Description |
|--------|---------|-------------|
| `asset.BalanceOf(token_id U64, address Identifier)` | `U256` | Balance of address for a given token |
| `asset.Symbol()` | `String` | Asset symbol |
| `asset.Creator()` | `Identifier` | Creator address |
| `asset.Manager()` | `Identifier` | Manager address |
| `asset.Decimals()` | `U64` | Decimal places |
| `asset.MaxSupply()` | `U256` | Maximum supply |
| `asset.CirculatingSupply()` | `U256` | Current circulating supply |
| `asset.EnableEvents()` | `Bool` | Whether events are enabled |

### Metadata

| Method | Signature | Description |
|--------|-----------|-------------|
| `asset.SetStaticMetadata(key String, value Bytes)` | — | Set asset-level static metadata |
| `asset.SetDynamicMetadata(key String, value Bytes)` | — | Set asset-level dynamic metadata |
| `asset.GetStaticMetadata(key String)` | `→ Bytes` | Read asset-level static metadata |
| `asset.GetDynamicMetadata(key String)` | `→ Bytes` | Read asset-level dynamic metadata |
| `asset.SetStaticTokenMetadata(token_id U64, key String, value Bytes)` | — | Set per-token static metadata |
| `asset.SetDynamicTokenMetadata(token_id U64, key String, value Bytes)` | — | Set per-token dynamic metadata |
| `asset.GetStaticTokenMetadata(token_id U64, key String)` | `→ Bytes` | Read per-token static metadata |
| `asset.GetDynamicTokenMetadata(token_id U64, key String)` | `→ Bytes` | Read per-token dynamic metadata |

Metadata values are `Bytes` — use `polorize()`/`depolorize()` to store typed data:

```coco
// Store a counter in dynamic metadata
asset.SetDynamicMetadata(key: "count", polorize(token_count))

// Read it back
memory value = asset.GetDynamicMetadata(key: "count")
memory count = depolorize(U64, value)
```

## Calling Asset Logic from Regular Logic

Regular logics **cannot** use `asset.*` directly. They must use an interface with an `asset:` section (see [07-interfaces.md](07-interfaces.md)):

```coco
coco Payment

interface TokenAsset:
    asset:
        Symbol() -> (symbol String)
        BalanceOf(address Identifier) -> (balance U256)
        Transfer(beneficiary Identifier, amount U256)
        Mint(beneficiary Identifier, amount U256)

endpoint dynamic Pay(assetId Identifier, receiver Identifier, amount U256):
    memory token = TokenAsset(assetId)
    emit f"Transferring {amount} {token.Symbol()}"
    token.Transfer(beneficiary: receiver, amount: amount)
```

## Asset Swap Pattern

```coco
coco SwapExample

interface AnAsset:
    asset:
        Transfer(beneficiary Identifier, amount U256)

endpoint dynamic Swap(
    assetId1, participant1, assetId2, participant2 Identifier,
    amount1, amount2 U256,
):
    // participant1 sends asset1 to participant2
    memory asset1 = AnAsset(assetId1, participant1)
    asset1.Transfer(beneficiary: participant2, amount: amount1)

    // participant2 sends asset2 to participant1
    memory asset2 = AnAsset(assetId2, participant2)
    asset2.Transfer(beneficiary: participant1, amount: amount2)
```

## Interface with Asset for Hiking Trail

```coco
interface HikersAsset:
    asset:
        Transfer(beneficiary Identifier, amount U256)
        TransferFrom(benefactor, beneficiary Identifier, amount U256)
        Approve(beneficiary Identifier, amount U256, expires_at U64)
        BalanceOf(address Identifier) -> (balance U256)

endpoint deploy InitTrail(reward_asset Identifier):
    memory A = HikersAsset(reward_asset, Sender)
    memory balance = A.BalanceOf(address: Sender)
    if balance == 0:
        throw "Only Sender with some assets can initialize"
```

## `dynamic` Qualifier and Asset Operations

Not all asset engine write operations require `dynamic` on the endpoint. The `dynamic` qualifier is only needed when the endpoint modifies **logic or actor state** (via `mutate`). Asset engine operations like `asset.Transfer()`, `asset.Approve()`, and `asset.Revoke()` modify the **asset engine's internal state**, which is separate from logic state.

In MAS0, the qualifiers follow this pattern:

| Endpoint | Qualifier | Why |
|----------|-----------|-----|
| Transfer, TransferFrom | (none/static) | Only calls asset engine, no logic state changes |
| Approve, Revoke | (none/static) | Only calls asset engine, no logic state changes |
| Lockup, Release | (none/static) | Only calls asset engine, no logic state changes |
| Mint, Burn | `dynamic` | Modifies circulating supply (asset engine treats these as state-changing) |
| SetStaticMetadata, SetDynamicMetadata | `dynamic` | Modifies asset metadata |

**Rule of thumb:** Use `dynamic` when the endpoint modifies logic/actor state via `mutate`, or when calling `asset.Mint()`, `asset.Burn()`, or metadata setters. Transfer, approval, and lockup operations don't require `dynamic`.

## Key Rules

1. **Only asset logics** can use `asset.*` — regular logics must use interfaces
2. **Asset logics are never deployed — they are *attached* to assets via `create`.** `deploy <Asset>.Init()` will not work; the `create` command is what instantiates the asset and binds the logic to it. The Sender of `create` automatically becomes the asset's creator and manager.
3. **`create` defines asset properties** — symbol, decimals, manager, max_supply, enable_events.
4. **MAS0 needs no post-`create` init** — there is no `Init` endpoint, go straight to `Mint`. **MAS1 and MAS2 require** `invoke <Asset>.Init() as <creator>` immediately after `create` to seed the token counter — never `deploy`. Omitting it makes the first `Mint` fail with `error: invalid key`.
5. **`token_id: 0`** — standard pattern for single fungible token types
6. **`asset.EnableEvents()`** — check before emitting to respect the asset's configuration
7. **`dynamic` is not always needed** — see qualifier table above
