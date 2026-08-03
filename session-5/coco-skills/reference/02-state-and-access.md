# 02 — State and Access

State is persistent data stored on-chain. Coco has two kinds of state with fundamentally different performance characteristics.

## Actor State vs Logic State

**This is the most important design decision in Coco.** Always prefer `state actor` (participant-centric) over `state logic` (centralized).

| Kind | Storage | Parallelism | Use For |
|------|---------|-------------|---------|
| `state actor` | Under each participant | **Parallel execution** | Per-user data: balances, settings, records, history |
| `state logic` | Under the logic itself | **Sequential (requires lock)** | Shared config only: token name, owner, admin address |

**Why this matters:** Mutating logic state requires a lock on the entire logic. If a million users call an endpoint that writes logic state, they must execute one at a time. With actor state, all million users can execute in parallel because each user's data is independent.

```
Logic state:  User1 → [LOCK] → write → unlock → User2 → [LOCK] → write → ...
Actor state:  User1 → write ─┐
              User2 → write ─┤ (all parallel)
              User3 → write ─┘
```

**Rule of thumb:** If the data belongs to a user, put it in `state actor`. Only use `state logic` for data that is truly shared and rarely written (initialization config, global settings).

### Anti-pattern: Storing per-user data in logic state

```coco
// BAD — blocks parallelism, every user waits for the lock
state logic:
    balances Map[Identifier]U256

endpoint dynamic Transfer(to Identifier, amount U256):
    mutate balances <- Module.Logic.balances:     // LOCK acquired
        balances[Sender] -= amount
        balances[to] += amount                     // LOCK released
```

### Correct: Per-user data in actor state

```coco
// GOOD — each user's balance is independent, parallel execution
state actor:
    balance U256

endpoint dynamic Transfer(to Identifier, amount U256):
    mutate bal <- Module.Sender.balance:           // No global lock
        if bal < amount:
            throw "Insufficient balance"
        bal -= amount
    mutate to_bal <- Module.Actor(to).balance:     // Independent access
        to_bal += amount
```

## State Declaration

Declare state blocks at the module top level, after `coco ModuleName`:

```coco
coco MyModule

// Shared config only — keep this minimal
state logic:
    name     String
    owner    Identifier

// Per-participant data — put most data here
state actor:
    balance  U256
    registered Bool
    records  Map[String]Record
```

**Note:** The keywords `persistent` and `ephemeral` are legacy aliases from older PISA versions (< 0.6.0). Always use `state logic` and `state actor` in new code.

## State Access Paths

State is accessed through three-component paths:

| Pattern | Meaning |
|---------|---------|
| `Module.Logic.field` | Logic state field |
| `Module.Sender.field` | Current sender's actor state |
| `Module.Actor(id).field` | Specific actor's state (by Identifier) |

The module name is a superglobal — always use the actual module name declared in `coco ModuleName`.

## Observe — Reading State

### Simple Read (no block)

Read a value and assign it to a variable:

```coco
// Read single value
observe supply <- MyModule.Logic.supply

// Read multiple values
observe name, supply <- MyModule.Logic.name, MyModule.Logic.supply

// Read actor state
observe balance <- MyModule.Sender.balance

// Read specific actor's state
observe other_balance <- MyModule.Actor(userId).balance
```

### Block Read

Read a value and use it within an indented block. The variable is available only inside the block.

```coco
observe supply <- MyModule.Logic.supply:
    if supply == 0:
        throw "No supply"
    memory half = supply / 2
```

### Observe with Output

```coco
endpoint static GetBalance() -> (balance U64):
    observe balance <- MyModule.Sender.balance
```

## Mutate — Writing State

### Direct Write

Assign a value directly to a state field:

```coco
// Write literal
mutate "TokenName" -> MyModule.Logic.name
mutate 1000 -> MyModule.Logic.supply

// Write variable
mutate name -> MyModule.Logic.name

// Write expression
mutate supply + 100 -> MyModule.Sender.balance

// Write to actor state
mutate true -> MyModule.Sender.registered
```

### Read-Modify-Write Block

Read the current value, modify it in a block, and the modified value is automatically written back:

```coco
mutate balance <- MyModule.Sender.balance:
    balance += 100

mutate supply <- MyModule.Logic.supply:
    if supply < amount:
        throw "Insufficient supply"
    supply -= amount
```

### Nested Mutations

You can nest mutate blocks:

```coco
mutate supply <- MyModule.Logic.supply:
    supply -= amount
    mutate balance <- MyModule.Sender.balance:
        balance += amount
```

### Yield Inside Mutate

Set return values from within a mutate block:

```coco
endpoint dynamic AddOne() -> (new_balance U64):
    mutate balance <- MyModule.Sender.balance:
        balance += 1
        yield new_balance balance
```

### Multiple Direct Writes

Write multiple values from a function call:

```coco
mutate (name, supply) <- NameSupply(n: "Token", s: 1000) -> MyModule.Logic.name, MyModule.Logic.supply
```

## Gather — Reading Complex Objects

Maps, arrays, and classes stored in state use **atomic storage** — their fields are scattered across storage slots. To read a complete object into memory, use `gather`:

```coco
state logic:
    person Person
    operators Map[U64]Operator

// Read a class from state
observe p <- MyModule.Logic.person:
    gather person <- p         // person is now a full memory copy

// Read a map entry that contains a class
observe operators <- MyModule.Logic.operators:
    memory op Operator
    gather op <- operators[0]  // load full Operator from map slot 0
    emit op.Identifier
```

**When you need gather:**
- Reading a class from state into memory
- Reading an array of classes from state
- Any time you need the full object, not just a scalar field

**When you DON'T need gather:**
- Reading scalar fields: `op = operators[0].Identifier` works without gather
- Reading scalar state fields: `observe supply <- Module.Logic.supply`

## Disperse — Writing Complex Objects

To write a complete complex object to state, use `disperse`:

```coco
// Write a class to state
mutate p <- MyModule.Logic.person:
    disperse p <- Person{name: "Alice", age: 25}

// Write a map to state
mutate balances <- MyModule.Logic.balances:
    disperse balances <- local_map

// Initialize empty collection in state
mutate p <- MyModule.Logic.posts:
    disperse make([]Post) -> p
    disperse append(p, Post{subject: "Hi", msg: "hello"})

// Write a map entry
mutate operators <- MyModule.Logic.operators:
    disperse operators[0] <- Operator{
        Identifier: "myID",
        Verification: VerifyProof{Kind: "strong", Proof: 66051},
        Guardians: make([]String, 0),
    }
```

### Disperse with Arrays in State

```coco
// Initialize array in state
mutate a <- MyModule.Logic.agents:
    disperse []Agent{
        Agent{id: 7, name: "007"},
        Agent{id: 1, name: "AtomicBlonde"},
    } -> a

// Append to array in state
mutate arr <- MyModule.Logic.arr:
    disperse append(arr, new_item)
```

### Disperse with Maps

```coco
// Replace entire map
mutate balances <- MyModule.Logic.balances:
    memory local_map Map[Identifier]U64
    local_map[addr1] = 100
    local_map[addr2] = 200
    disperse balances <- local_map

// This is expensive for large maps — prefer individual field writes when possible
```

## Sweep — Cleanup After Removal

When removing elements from collections in state, use `sweep` to clean up empty storage slots:

```coco
mutate operators <- MyModule.Logic.operators:
    sweep remove(operators, 0)    // Remove map entry and clean storage
    sweep(operators)              // Clean the collection itself

mutate arr <- MyModule.Logic.arr:
    sweep popend(arr)             // Remove last element and clean

// sweep can also capture return values
memory removed = sweep popend(arr)
```

## Complete Example: Token Ledger

```coco
coco TokenLedger

const I1 Identifier = 0x1111111111111111111111111111111111111111111111111111111111111111
const I2 Identifier = 0x2222222222222222222222222222222222222222222222222222222222222222

state logic:
    supply   U64
    balances Map[Identifier]U64

endpoint deploy SeedSupply(supply U64, seed Identifier):
    mutate supply -> TokenLedger.Logic.supply
    mutate balances <- TokenLedger.Logic.balances:
        balances[seed] = supply

endpoint dynamic LoadAllBalances():
    memory local_balances Map[Identifier]U64
    local_balances[I1] = 100
    local_balances[I2] = 200
    mutate balances <- TokenLedger.Logic.balances:
        disperse balances <- local_balances

endpoint static Balance(account Identifier) -> (balance U64):
    observe b <- TokenLedger.Logic.balances:
        balance = b[account]
```

## Common Gotchas

1. **You must use `disperse` to write complex objects** — `mutate myMap -> Module.Logic.myMap` will NOT work for maps/arrays/classes. You must open a mutate block and disperse.

2. **`gather` is required to read full objects** — If you want the whole class/map/array, not just a scalar field, you need gather.

3. **Scalar fields work without gather/disperse** — Reading `operators[0].Identifier` or writing `balances[key] = value` inside a mutate block works for scalar values.

4. **Observe blocks are read-only** — You cannot mutate state inside an observe block (but you can nest a mutate block inside).

5. **The variable from mutate-block is auto-written back** — After the block ends, the modified value is persisted. No explicit save needed.

6. **`pass` for empty mutate blocks** — If you open a mutate block but don't need to do anything, use `pass`.
```coco
mutate bytes <- MyModule.Logic.bytes:
    pass
```
