# 15 — Project Setup & Lifecycle

End-to-end guide from project creation to testing and deployment.

## 1. Initialize a New Project

```bash
mkdir my_token && cd my_token
coco nut init
```

This creates a `coco.nut` TOML configuration file. Edit it:

```toml
[coco]
version = "0.8.0"

[module]
name = "MyToken"
version = "0.0.1"
license = []
repository = ""
authors = []

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "YAML"
output = "my_token"

[target.pisa]
format = "ASM"
version = "0.7.0"
```

## 2. Write Your First Logic

Create `my_token.coco`. Note: per-user data goes in `state actor` (parallel execution), only shared config in `state logic`:

```coco
coco MyToken

// Shared config only — keep minimal
state logic:
    name String

// Per-user data — this is where most data belongs
state actor:
    balance U256

endpoint deploy Init(name String):
    mutate name -> MyToken.Logic.name

endpoint enlist Register():
    mutate U256(0) -> MyToken.Sender.balance

endpoint dynamic Mint(amount U256):
    mutate balance <- MyToken.Sender.balance:
        balance += amount

endpoint dynamic Transfer(to Identifier, amount U256):
    mutate bal <- MyToken.Sender.balance:
        if bal < amount:
            throw "Insufficient balance"
        bal -= amount
    mutate to_bal <- MyToken.Actor(to).balance:
        to_bal += amount

endpoint GetBalance(account Identifier) -> (balance U256):
    observe balance <- MyToken.Actor(account).balance

endpoint GetName() -> (name String):
    observe name <- MyToken.Logic.name
```

## 3. Compile

```bash
coco compile
```

This compiles all `.coco` files referenced by `coco.nut` and produces a manifest in the configured output format (YAML/JSON/POLO).

**If compilation fails:** Read the error message carefully. See [14-error-reference.md](14-error-reference.md) for common errors and fixes.

## 4. Test Interactively with Cocolab

```bash
coco compile         # produces my_token.yaml from coco.nut [target.moi]
coco lab start
```

Then in the REPL (always load logics from the compiled manifest file — the bare `compile MyToken` and `from coco(...)` forms are not reliable):

```
> register alice
> register bob
> set default.sender alice
> compile MyToken from manifest(my_token.yaml)
> deploy MyToken.Init(name: "MyToken") as alice
> enlist MyToken.Register() as alice
> enlist MyToken.Register() as bob
> invoke MyToken.Mint(amount: 1000) as alice
> invoke MyToken.Transfer(to: bob, amount: 100) as alice
> invoke MyToken.GetBalance(account: alice)
  Execution Outputs ||| balance:900
> invoke MyToken.GetBalance(account: bob)
  Execution Outputs ||| balance:100
> exit
```

## 5. Add Lab Scripts for Automated Testing

Add to `coco.nut`:

```toml
[lab.scripts]
test-token = [
    "compile MyToken from manifest(my_token.yaml)",
    "register alice",
    "register bob",
    "set default.sender alice",
    "deploy MyToken.Init(name: \"MyToken\") as alice",
    "enlist MyToken.Register() as alice",
    "enlist MyToken.Register() as bob",
    "invoke MyToken.Mint(amount: 1000) as alice",
    "invoke MyToken.Transfer(to: bob, amount: 100) as alice",
    "invoke MyToken.GetBalance(account: alice)",
    "invoke MyToken.GetBalance(account: bob)",
]
```

Run it:
```bash
coco lab run test-token
```

## 6. Add Bash Verification Scripts

Add to `coco.nut`:

```toml
[scripts]
build = "coco compile"
test = '''
PASS=0
FAIL=0
coco compile >/dev/null 2>&1 || exit 1       # produce my_token.yaml before the lab script loads it
TEST_RESULTS=$(coco lab run test-token 2>&1)

echo "$TEST_RESULTS" | grep -q 'balance:900' \
    && { echo 'PASS: alice balance after transfer'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: alice balance after transfer'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'balance:100' \
    && { echo 'PASS: bob balance after transfer'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: bob balance after transfer'; FAIL=$((FAIL+1)); }

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
'''
```

Run:
```bash
coco nut run build    # compile
coco nut run test     # run tests with verification
```

## 7. Add Inline Tests

Add test comments directly in `.coco` files:

```coco
// < deploy TEST.Init(name: "MyToken")
// >

// < invoke TEST.GetName()
// > name: MyToken
```

Run:
```bash
coco test MyToken
```

## Complete `coco.nut` Example

```toml
[coco]
version = "0.8.0"

[module]
name = "MyToken"
version = "0.0.1"
license = []
repository = ""
authors = ["Alice"]

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "YAML"
output = "my_token"

[target.pisa]
format = "ASM"
version = "0.7.0"

[lab.render]
big_int_as_hex = false
bytes_as_hex = false

[lab.config.default]
url = "http://127.0.0.1:6060"
env = "main"

[lab.scripts]
test-token = [
    "compile MyToken from manifest(my_token.yaml)",
    "register alice",
    "register bob",
    "set default.sender alice",
    "deploy MyToken.Init(name: \"MyToken\") as alice",
    "enlist MyToken.Register() as alice",
    "enlist MyToken.Register() as bob",
    "invoke MyToken.Mint(amount: 1000) as alice",
    "invoke MyToken.Transfer(to: bob, amount: 100) as alice",
    "invoke MyToken.GetBalance(account: alice)",
    "invoke MyToken.GetBalance(account: bob)",
]

[scripts]
build = "coco compile"
test = '''
PASS=0
FAIL=0
coco compile >/dev/null 2>&1 || exit 1       # produce my_token.yaml before the lab script loads it
TEST_RESULTS=$(coco lab run test-token 2>&1)

echo "$TEST_RESULTS" | grep -q 'balance:900' \
    && { echo 'PASS: alice balance'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: alice balance'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'balance:100' \
    && { echo 'PASS: bob balance'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: bob balance'; FAIL=$((FAIL+1)); }

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
'''
```

## Project Structure

A typical Coco project:

```
my_token/
  coco.nut              # Project config
  my_token.coco         # Main source file
  my_token.yaml         # Compiled manifest (generated)
```

With packages:

```
my_project/
  coco.nut
  main.coco
  pkg/
    utils/
      coco.nut
      utils.coco
    math/
      coco.nut
      math.coco
```

## Asset Logic Project

Asset logics use `coco asset` and don't need deploy endpoints for fungible tokens:

```coco
coco asset MyAsset

endpoint dynamic Mint(beneficiary Identifier, amount U256):
    asset.Mint(token_id: 0, beneficiary, amount)

endpoint Transfer(beneficiary Identifier, amount U256):
    asset.Transfer(token_id: 0, beneficiary, amount)

endpoint BalanceOf(address Identifier) -> (balance U256):
    balance = asset.BalanceOf(token_id: 0, address)
```

Test in Cocolab:
```
compile MyAsset from manifest(my_asset.yaml)
register alice
register bob
set default.sender alice
create MyAsset(symbol: "TKN", decimals: 18, manager: alice, max_supply: 1000000, enable_events: true) as alice
invoke MyAsset.Mint(beneficiary: alice, amount: 1000) as alice
invoke MyAsset.Transfer(beneficiary: bob, amount: 100) as alice
invoke MyAsset.BalanceOf(address: alice)
invoke MyAsset.BalanceOf(address: bob)
```

## CLI Command Reference

| Command | Purpose |
|---------|---------|
| `coco nut init` | Create `coco.nut` in current directory |
| `coco compile` | Compile module from `coco.nut` config |
| `coco test <module>` | Run inline tests (`// <` / `// >` comments) |
| `coco lab start` | Start interactive REPL |
| `coco lab init` | Load logic from `coco.nut` manifest + register default user |
| `coco lab run <script>` | Run a lab script defined in `[lab.scripts]` |
| `coco nut run <script>` | Run a bash script defined in `[scripts]` |
| `coco manifest convert` | Convert manifest between YAML/JSON/POLO formats |
| `coco version` | Show compiler and PISA version |
