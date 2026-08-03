# 13 — Common Patterns

Real-world patterns extracted from production Coco code and test suite.

## Pattern 1: Context-Flipper (Participant-Centric — Recommended)

The preferred approach: each participant owns their own boolean. Enables parallel execution.

```coco
coco ContextFlipper

state actor:
    value Bool

endpoint enlist Seed(initial Bool):
    mutate initial -> ContextFlipper.Sender.value

endpoint dynamic Flip():
    mutate value <- ContextFlipper.Sender.value:
        value = !value

endpoint static Mode() -> (value Bool):
    observe value <- ContextFlipper.Sender.value
```

> **Why not `state logic`?** A logic-state Flipper forces sequential execution — if 1M users flip, each waits for a lock. With actor state, all 1M users flip in parallel. Always prefer `state actor` for per-user data.

**Tests:**
```coco
// < enlist TEST.Seed(initial: true)
// >
// < invoke TEST.Mode()
// > value: true
// < invoke TEST.Flip()
// >
// < invoke TEST.Mode()
// > value: false
```

## Pattern 2: Token Ledger (Actor-Centric)

Standard token with per-user balances in actor state for parallel execution. Only shared config (name, symbol) goes in logic state.

```coco
coco Token

// Logic state: only shared config
state logic:
    name     String
    symbol   String

// Actor state: per-user data (parallel execution)
state actor:
    balance U256

endpoint deploy Init(name String, symbol String):
    mutate name -> Token.Logic.name
    mutate symbol -> Token.Logic.symbol

endpoint enlist Register():
    mutate U256(0) -> Token.Sender.balance

endpoint dynamic Mint(amount U256):
    mutate bal <- Token.Sender.balance:
        bal += amount

endpoint dynamic Transfer(to Identifier, amount U256):
    mutate bal <- Token.Sender.balance:
        if bal < amount:
            throw "Insufficient balance"
        bal -= amount
    mutate to_bal <- Token.Actor(to).balance:
        to_bal += amount

endpoint static Balance(account Identifier) -> (balance U256):
    observe balance <- Token.Actor(account).balance

endpoint static GetInfo() -> (name String, symbol String):
    observe name <- Token.Logic.name
    observe symbol <- Token.Logic.symbol
```

> **Note:** Balances are in `state actor`, not in a `Map[Identifier]U256` in logic state. This is critical — a map in logic state locks the entire logic for every transfer, blocking parallelism.

## Pattern 3: Guard Functions

Reusable access control checks.

```coco
function AdminOnly():
    memory admin Identifier
    observe admin <- MyModule.Logic.admin
    if Sender != admin:
        throw "User is not super admin"

function DonorOnly():
    observe donors <- MyModule.Logic.donors:
        if !donors[Sender]?:
            throw "User is not a registered donor"

// Usage in endpoints:
endpoint dynamic AdminAction():
    AdminOnly()                    // throws if not admin
    // ... admin-only logic
```

## Pattern 4: CRUD with Classes in State

Store, retrieve, update, and delete complex objects.

```coco
coco PostBoard

class Post:
    field subject String
    field msg String

state logic:
    posts []Post

endpoint dynamic Init():
    mutate p <- PostBoard.Logic.posts:
        disperse make([]Post) -> p
        disperse append(p, Post{subject: "Hi", msg: "hello"})
        disperse append(p, Post{subject: "Kiss", msg: "💋💋💋"})

endpoint GetAllPosts() -> (posts []Post):
    memory all_posts []Post
    observe psts <- PostBoard.Logic.posts:
        for _, post in psts:
            memory mem_post = Post{
                subject: post.subject,
                msg: post.msg,
            }
            append(all_posts, mem_post)
    posts = all_posts

endpoint GetAllHeaders() -> (headers []String):
    memory all_headers []String
    observe psts <- PostBoard.Logic.posts:
        for _, post in psts:
            append(all_headers, post.subject)
    headers = all_headers
```

## Pattern 5: Cross-Logic Interaction

Your logic calling another deployed logic through an interface.

```coco
coco question

class Person:
    field name String
    field age U64
    field friend_names []String
    field friends Map[String]Bool

interface answer:
    state logic:
        guru Person
    state actor:
        ActorAnswer U64
    endpoint:
        dynamic SetActorAnswer(actorId Identifier, new_answer U64) -> (set_answer U64)
        Guru() -> (guru Person)

// Set value on external logic
endpoint dynamic SetAnswer(answerLogicId Identifier, new_answer U64) -> (set_answer U64):
    memory answer_iface = answer(answerLogicId)
    set_answer = answer_iface.SetActorAnswer(actorId: Sender, new_answer)

// Set value for this logic's identity on external logic
endpoint dynamic SetMyAnswer(answerLogicId Identifier, new_answer U64):
    memory answer_iface = answer(answerLogicId)
    answer_iface.SetActorAnswer(actorId: Identifier(question), new_answer)

// Read from external logic
endpoint dynamic GetAnswers(answerLogicId Identifier) -> (guru Person, actorAnswer U64):
    memory answer_iface = answer(answerLogicId)
    observe gg <- answer_iface.Logic.guru:
        memory fn []String
        gather fn <- gg.friend_names
        memory fr Map[String]Bool
        for _, name in fn:
            fr[name] = gg.friends[name]
        guru = Person{
            name: gg.name,
            age: gg.age,
            friend_names: fn,
            friends: fr,
        }
    observe actorAnswer <- answer_iface.Sender.ActorAnswer
```

## Pattern 6: MAS0 Fungible Token (Asset Logic)

The canonical ERC20-equivalent asset logic. No deploy endpoint — `create` in Cocolab handles setup. See [`standards/mas0/mas0.coco`](../standards/mas0/mas0.coco) for the full drop-in reference implementation.

```coco
coco asset MAS0

event AssetEvent:
    topic operation String
    field operator Identifier
    field benefactor Identifier
    field beneficiary Identifier
    field amount U256
    field expires_at U64

endpoint Transfer(beneficiary Identifier, amount U256):
    if asset.EnableEvents():
        emit AssetEvent{operation: "Transfer", operator: Sender, benefactor: Sender,
            beneficiary: beneficiary, amount: amount}
    asset.Transfer(token_id: 0, beneficiary, amount)

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

endpoint Approve(beneficiary Identifier, amount U256, expires_at U64):
    if asset.EnableEvents():
        emit AssetEvent{operation: "Approve", operator: Sender, benefactor: Sender,
            beneficiary: beneficiary, amount: amount, expires_at: expires_at}
    asset.Approve(token_id: 0, beneficiary, amount, expires_at)

endpoint Symbol() -> (symbol String):
    symbol = asset.Symbol()

endpoint BalanceOf(address Identifier) -> (balance U256):
    balance = asset.BalanceOf(token_id: 0, address)

endpoint CirculatingSupply() -> (circulating_supply U256):
    circulating_supply = asset.CirculatingSupply()
```

**Key patterns:**
- `asset.EnableEvents()` — conditionally emit events (set via `create` command)
- `token_id: 0` — standard for fungible tokens (single token type)
- All `asset.*` methods are wrapped in endpoints with matching signatures

**Testing in Cocolab:**
```
register alice
register bob
set default.sender alice
compile AnAsset from manifest(standards/mas0/mas0.yaml)
create AnAsset(symbol: "BTC", decimals: 18, manager: alice, max_supply: 1000000, enable_events: true) as alice
invoke AnAsset.Mint(beneficiary: alice, amount: 1000) as alice
invoke AnAsset.Transfer(beneficiary: bob, amount: 10) as alice
invoke AnAsset.BalanceOf(address: alice)    // → balance:990
invoke AnAsset.BalanceOf(address: bob)      // → balance:10
```

## Pattern 7: Asset Swap

Atomic exchange between two participants using asset interfaces (regular logic calling asset logics via interface).

```coco
coco SwapExample

interface AnAsset:
    asset:
        Transfer(beneficiary Identifier, amount U256)

endpoint dynamic Swap(
    assetId1, participant1, assetId2, participant2 Identifier,
    amount1, amount2 U256,
):
    memory asset1 = AnAsset(assetId1, participant1)
    memory asset2 = AnAsset(assetId2, participant2)
    asset1.Transfer(beneficiary: participant2, amount: amount1)
    asset2.Transfer(beneficiary: participant1, amount: amount2)
```

## Pattern 8: Nested Observe with State Updates

Reading state, making decisions, then updating.

```coco
endpoint Checkout(data String):
    // First check verified list for duplicates
    observe verified <- MountainTrail.Sender.verified:
        for _, existing in verified:
            if data == existing:
                throw "Data already verified"

    // Then check signatures and update
    observe sigs, organizer, reward_asset, reward_amount <- MountainTrail.Logic.signatures, MountainTrail.Logic.organizer, MountainTrail.Logic.reward_asset, MountainTrail.Logic.reward_amount:
        for _, sig in sigs:
            if data == sig:
                mutate verified <- MountainTrail.Sender.verified:
                    append(verified, data)
                    emit f"Data verified"
                    if len(sigs) == len(verified):
                        memory A = HikersAsset(reward_asset, Sender)
                        A.TransferFrom(benefactor: organizer, beneficiary: Sender, amount: reward_amount)
                return
        throw "invalid data"
```

## Pattern 9: Operator Registry (Complex Map State)

Managing a map of complex objects in state.

```coco
coco Registry

class VerifyProof:
    field Kind String
    field Proof U64

class Operator:
    field Identifier String
    field Verification VerifyProof
    field Guardians []String

state logic:
    Operators Map[U64]Operator

// Initialize with complex nested object
endpoint dynamic Init(moid String):
    mutate operators <- Registry.Logic.Operators:
        disperse operators[0] <- Operator{
            Identifier: moid,
            Verification: VerifyProof{Kind: "strong", Proof: 66051},
            Guardians: make([]String, 0),
        }

// Read complex object with gather
endpoint GetOperator(idx U64) -> (op String):
    observe operators <- Registry.Logic.Operators:
        memory o Operator
        gather o <- operators[idx]
        op = o.Identifier

// Cleanup with sweep
endpoint dynamic Cleanup():
    mutate operators <- Registry.Logic.Operators:
        sweep remove(operators, 0)
        sweep(operators)
```

## Pattern 10: Actor Storage with Counter

Per-user counters using actor state.

```coco
coco CounterApp

state actor:
    counter U64

endpoint enlist InitCounter():
    mutate 0 -> CounterApp.Sender.counter

endpoint dynamic Increment():
    mutate c <- CounterApp.Sender.counter:
        c += 1

endpoint static GetCount() -> (count U64):
    observe count <- CounterApp.Sender.counter
```

## Pattern 11: Module with Package Imports

Full module using classes and functions from packages.

```coco
coco main

imports:
    "./math"
    io2 "./math/iopkg"
    mypkg "../tstpkg"

endpoint Y() -> (y U64):
    memory x = []U64{1, 2, io2::NUM4}
    memory y_arr = (y) <- io2::Y()
    memory z = math::Complex{re: io2::NUM4, im: y_arr[1]}
    memory w = math::Complex
    w.re = io2::NUM4
    w.im = y_arr[2]
    z = w
    yield y (abs) <- z.Abs()

endpoint Len(point math::Point) -> (l U64):
    if U64(point.coords[1]) != (four) <- math::four():
        throw f"Not four: {point.coords[1]}"
    l = (dist) <- point.dist(other: math::Point{coords: [3]I64{I64(0), I64(0), I64(0)}})
```

## Anti-Patterns to Avoid

### 1. Forgetting `disperse` for Complex State Writes

```coco
// WRONG — won't work for maps/arrays/classes
mutate localMap -> Module.Logic.balances

// CORRECT
mutate balances <- Module.Logic.balances:
    disperse balances <- localMap
```

### 2. Missing `gather` for Full Object Reads

```coco
// WRONG — person fields may be incomplete
observe p <- Module.Logic.person:
    memory person = p

// CORRECT
observe p <- Module.Logic.person:
    gather person <- p
```

### 3. Modifying Arguments

```coco
// WRONG — arguments are read-only
function Bad(a U64) -> (out U64):
    a += 1
    out = a

// CORRECT
function Good(a U64) -> (out U64):
    memory x = a
    x += 1
    out = x
```

### 4. Using `while` or Infinite Loops

```coco
// WRONG — no while in Coco
while condition:
    doSomething()

// CORRECT — use for with range
for i in range(maxIterations):
    if !condition:
        break
    doSomething()
```

### 5. Forgetting `sweep` on State Collection Removal

```coco
// WRONG — leaves orphaned storage slots
mutate ops <- Module.Logic.operators:
    remove(ops, key)

// CORRECT
mutate ops <- Module.Logic.operators:
    sweep remove(ops, key)
    sweep(ops)
```

### 6. Wrong State Qualifier

```coco
// WRONG — observe can't be used with dynamic
endpoint static Transfer():      // says static but mutates!
    mutate bal <- Module.Sender.balance:
        bal -= 1

// CORRECT
endpoint dynamic Transfer():
    mutate bal <- Module.Sender.balance:
        bal -= 1
```

---

## Security Patterns

### Pattern S1: Owner-Only Access Control

```coco
coco Owned

state logic:
    owner Identifier

endpoint deploy Init():
    mutate Sender -> Owned.Logic.owner

function RequireOwner():
    observe owner <- Owned.Logic.owner
    if Sender != owner:
        throw "Unauthorized: caller is not the owner"

endpoint dynamic TransferOwnership(new_owner Identifier):
    RequireOwner()
    mutate new_owner -> Owned.Logic.owner
```

### Pattern S2: Balance Check Before Transfer

Always verify sufficient funds before mutating balances:

```coco
endpoint dynamic Transfer(to Identifier, amount U256):
    if amount == 0:
        throw "Amount must be positive"
    mutate sender_bal <- Module.Sender.balance:
        if sender_bal < amount:
            throw f"Insufficient balance: have {sender_bal}, need {amount}"
        sender_bal -= amount
    mutate to_bal <- Module.Actor(to).balance:
        to_bal += amount
```

### Pattern S3: Reentrancy-Safe State Updates

In Coco, `mutate` blocks are atomic — state is only committed when the block completes successfully. This provides natural reentrancy protection. Always update sender's state **before** interacting with external logics:

```coco
endpoint dynamic Withdraw(asset_id Identifier, amount U256):
    // 1. Update local state FIRST (checks-effects-interactions)
    mutate bal <- Module.Sender.balance:
        if bal < amount:
            throw "Insufficient balance"
        bal -= amount

    // 2. Then interact with external logic
    memory token = TokenAsset(asset_id)
    token.Transfer(beneficiary: Sender, amount: amount)
```

### Pattern S4: Input Validation Guard Functions

Create reusable validation functions:

```coco
function RequireNonEmpty(value String, field_name String):
    if len(value) == 0:
        throw f"{field_name} cannot be empty"

function RequireInRange(value U64, min U64, max U64):
    if value < min || value > max:
        throw f"Value {value} not in range [{min}, {max}]"

function RequireExists(records Map[String]Record, key String):
    if !records[key]?:
        throw f"Record '{key}' not found"
```

### Pattern S5: Rate Limiting with Timestamps

```coco
state actor:
    last_action U64

endpoint dynamic DoAction(current_time U64):
    observe last <- Module.Sender.last_action
    if current_time - last < 60:
        throw "Action rate limited: wait 60 seconds"
    mutate current_time -> Module.Sender.last_action
    // ... perform action
```

### Pattern S6: Safe Map Access

Always check key existence before accessing map values:

```coco
// WRONG — may panic on missing key
memory val = records[key]

// RIGHT — check first
if records[key]?:
    memory val = records[key]
else:
    throw f"Key '{key}' not found"
```

### Pattern S7: Preventing Double Initialization

```coco
state logic:
    initialized Bool

endpoint deploy Init(config String):
    observe already <- Module.Logic.initialized
    if already:
        throw "Already initialized"
    mutate true -> Module.Logic.initialized
    // ... initialization logic
```
