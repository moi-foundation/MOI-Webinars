# 10 — Testing Patterns

## Inline Test Format

Tests are embedded in `.coco` files as special comments. The compiler ignores them, but `coco test` processes them.

### Syntax

```
// < <command> TEST.<EndpointName>(arg1: value1, arg2: value2)
// > expected_output
```

- `// <` — test input (invocation command)
- `// >` — expected output (space-separated `name:value` pairs)
- `TEST` — placeholder for the current module (resolved at test time)

### Commands

| Command | Description |
|---------|-------------|
| `deploy` | Deploy the logic (runs deploy endpoint) |
| `enlist` | Enlist an actor (runs enlist endpoint) |
| `invoke` | Call an endpoint (standard invocation) |
| `create` | Create an asset |

### Basic Example

```coco
coco Calculator

// < invoke TEST.Add(a: 5, b: 3)
// > sum: 8
endpoint Add(a, b U64) -> (sum U64):
    sum = a + b

// < invoke TEST.Add(a: 0, b: 0)
// > sum: 0
```

### Test Sequencing

Tests run **top-to-bottom** in the file. State persists between tests, so deploy/enlist must come first:

```coco
coco TokenLedger

state logic:
    supply U64
    balances Map[Identifier]U64

// Step 1: Deploy (must come first)
// < deploy TEST.SeedSupply(supply: 1000, seed: 0x1111111111111111111111111111111111111111111111111111111111111111)
// >
endpoint deploy SeedSupply(supply U64, seed Identifier):
    mutate supply -> TokenLedger.Logic.supply
    mutate balances <- TokenLedger.Logic.balances:
        balances[seed] = supply

// Step 2: Query (depends on deploy above)
// < invoke TEST.Balance(account: 0x1111111111111111111111111111111111111111111111111111111111111111)
// > balance:1000
endpoint static Balance(account Identifier) -> (balance U64):
    observe b <- TokenLedger.Logic.balances:
        balance = b[account]
```

### Multiple Tests Per Endpoint

```coco
// < invoke TEST.SimpleSwitchNum(x: 0)
// > s: zero
// < invoke TEST.SimpleSwitchNum(x: 1)
// > s: one
// < invoke TEST.SimpleSwitchNum(x: 2)
// > s: a lot
endpoint SimpleSwitchNum(x U64) -> (s String):
    switch x:
        case 0: s = "zero"
        case 1: s = "one"
        default: s = "a lot"
```

### Empty Output

When an endpoint has no return values, leave `// >` empty:

```coco
// < deploy TEST.Init()
// >
endpoint deploy Init():
    mutate 0 -> Module.Logic.supply
```

### Error Testing

Test that an endpoint throws:

```coco
// < invoke TEST.Fail(id: 5)
// > !builtin.AccessError::map key does not exist
endpoint Fail(id U64) -> (v U64):
    observe votes <- NM.Logic.votes:
        v = votes[Identifier(0)][id]    // key doesn't exist
```

Error format: `!<error_type>::<error_message>`

## Output Format

Test output is space-separated `name:value` pairs matching the endpoint's return signature:

| Type | Output Format | Example |
|------|---------------|---------|
| `String` | Raw text | `name: Alice` |
| `U64` | Decimal | `count: 42` |
| `I64` | Decimal (with sign) | `val: -10` |
| `U256` | Hex with `0x` prefix | `supply: 0x7b` |
| `Bool` | `true`/`false` | `ok: true` |
| `Bytes` | Hex with `0x` prefix | `data: 0x004142` |
| `Identifier` | Hex with `0x` prefix | `addr: 0x1111...` |
| `[]Type` | `[elem1 elem2 ...]` | `items: [1 2 3]` |
| `Map[K]V` | `map[k1:v1 k2:v2]` | `m: map[0:No 1:Yes]` |
| `Class` | Nested maps of fields | `op: map[Identifier:myMOID]` |

### Complex Output Examples

```coco
// Array of strings
// > headers:[Hi Kiss]

// Map
// > m: map[0:No 1:Yes]

// Class with nested fields
// > op: map[Guardians:[]] map[Identifier:myMOID] map[Verification:map[Kind:strong Proof:66051]]

// Multiple return values
// > name:Alice+Bob hobbies:[swimming dancing hiking]

// Array of classes
// > posts: [map[msg:hello] map[subject:Hi] map[msg:💋💋💋] map[subject:Kiss]]
```

## Passing Complex Arguments

```coco
// Array argument
// < invoke TEST.TestMerge(a: []U64{1, 2, 3}, b: []U64{4, 5})
// > c: [1 2 3 4 5]

// Class argument
// < invoke TEST.SwitchDefaultEq(input: Person{name: "mel"})
// > x: 3

// Class from package
// < invoke TEST.Len(point: math::Point{coords: [3]U64{3, 4, 12}})
// > l: 13

// Identifier argument (full 32-byte hex)
// < invoke TEST.Balance(account: 0x1111111111111111111111111111111111111111111111111111111111111111)
// > balance: 1000

// Deploy with class argument
// < deploy TEST.Init(person: Person{name: "Alice", age: 25})
// >
```

## Running Tests

```bash
# Test a module in the current directory
coco test <module_name>

# With fuel limit
coco test <module_name> --fuel 1000

# With optimization
coco test <module_name> --optimize 2
```

## YAML Test Manifests

For more complex test scenarios (multi-step, multi-user), use YAML test files:

```yaml
# test.yaml
name: "Token Test"
module: "TokenLedger"
tests:
  - command: deploy
    endpoint: SeedSupply
    args:
      supply: 1000
      seed: "0x1111111111111111111111111111111111111111111111111111111111111111"
  - command: invoke
    endpoint: Balance
    args:
      account: "0x1111111111111111111111111111111111111111111111111111111111111111"
    expected:
      balance: 1000
```

## Integration Testing with Lab Scripts

For complex multi-user, multi-step test scenarios that go beyond inline tests, use **Cocolab lab scripts** combined with **bash verification scripts** in `coco.nut`. This is the recommended approach for production-level testing.

### Two-Layer Architecture

1. **`[lab.scripts]`** — Define ordered Cocolab commands that set up and exercise the logic
2. **`[scripts]`** — Define bash scripts that run the lab scripts and verify output with `grep`

```bash
# Run the lab script (Cocolab commands)
coco lab run test-my-logic

# Run the bash verification script
coco nut run test
```

### When to Use Each Approach

| Approach | Best For |
|----------|----------|
| Inline tests (`// <` / `// >`) | Single-user, simple input→output, unit-level |
| Lab scripts + bash verification | Multi-user, state transitions, error paths, integration-level |

### Quick Example

```toml
# In coco.nut:

[lab.scripts]
test-token = [
    "compile Token from manifest(token.json)",
    "register alice",
    "register bob",
    "invoke Token.Mint(to: alice, amount: 1000) as alice",
    "invoke Token.Transfer(to: bob, amount: 100) as alice",
    "invoke Token.GetBalance(actor_id: alice)",
    "invoke Token.GetBalance(actor_id: bob)",
]

[scripts]
test = '''
PASS=0
FAIL=0
TEST_RESULTS=$(coco lab run test-token 2>&1)

echo "$TEST_RESULTS" | grep -q 'balance:900' \
    && { echo 'PASS: alice balance'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: alice balance'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'balance:100' \
    && { echo 'PASS: bob balance'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: bob balance'; FAIL=$((FAIL+1)); }

echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
'''
```

See [12-cocolab-repl.md](12-cocolab-repl.md) for complete details on lab scripts, argument syntax, grep patterns, and a full production example.

## Writing Good Tests

1. **Deploy first** — Always test deploy/enlist endpoints before others
2. **Test state progression** — Tests run sequentially, so test state changes in order
3. **Cover edge cases** — Test zero values, empty collections, boundary conditions
4. **Test error cases** — Use `!error.Type::message` format for expected errors
5. **Multiple inputs per endpoint** — Test several argument combinations
6. **Keep tests next to endpoints** — Place `// <` / `// >` directly above the endpoint they test

### Example: Complete Test Coverage

```coco
coco storetest

state logic:
    supply   U256
    add      U256

// Test 1: Deploy and initialize
// < deploy TEST.Init(name: "TstName", symbol: "TN", supply: 123)
// >
endpoint dynamic Init(name String, symbol String, supply U256):
    mutate name, symbol -> storetest.Logic.name, storetest.Logic.symbol
    mutate (name, supply) <- NameSupply(n: name, s: supply) -> storetest.Logic.name, storetest.Logic.supply

// Test 2: Verify initialization
// < invoke TEST.TstInit()
// > name: TstName symbol: TN supply: 0x7b
endpoint TstInit() -> (name String, symbol String, supply U256):
    observe name <- storetest.Logic.name
    observe symbol <- storetest.Logic.symbol
    observe supply <- storetest.Logic.supply

// Test 3: Test computation with state
// < invoke TEST.SimpleAdd(n: 10)
// > out: 0xb
endpoint dynamic SimpleAdd(n U256) -> (out U256):
    mutate add <- storetest.Logic.add:
        add = 1
    observe add <- storetest.Logic.add:
        memory x = n
        x += add
        out = x
```
