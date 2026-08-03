# 11 — Cocolab REPL

Cocolab is an interactive REPL for testing Coco logics. It can be used interactively or scripted via `coco.nut`.

## Starting Cocolab

### Interactive Mode

```bash
coco lab start
```

### Initialize Lab Environment

```bash
coco lab init
```

Loads and compiles the logic from the manifest configured in `coco.nut`, and registers `default_user`. The project must already be initialized with `coco nut init`.

### CLI Flags

| Flag | Description |
|------|-------------|
| `--ast` | Print the AST during compilation |
| `--debug_pisa` | Print PISA debug output |
| `--sender <id>` | Set default sender |
| `-f <fuel>` | Set initial default fuel (basefuel) limit |
| `-c <path>` | Specify config file path |
| `-s <path>` | Specify source path |
| `--no-persist` | Disable snapshot persistence (start with a clean session every time) |
| `--new-session` | Ignore any saved snapshot and start fresh, but still persist on exit |

### Core Workflow

**Regular logics:**
```
1. compile   →  Load a logic
2. register  →  Create users
3. deploy    →  Initialize logic (deploy endpoint)
4. enlist    →  Initialize actors (enlist endpoint)
5. invoke    →  Call endpoints
6. observe   →  Read state
```

**Asset logics** — use `create` instead of `deploy`:
```
1. compile   →  Load the asset logic
2. register  →  Create users
3. create    →  Deploy and define asset properties (replaces deploy)
4. invoke    →  Call endpoints
5. observe   →  Read state
```

### Compile

Load a logic into the lab **from a pre-built manifest file**:

```
compile MyToken from manifest("./path/to/manifest.yaml")
compile MyToken from manifest(intelligence.json)
compile MyToken from manifest(mas0.polo)
```

**Always use the `from manifest(...)` form.** Cocolab can only reliably load logics from a compiled manifest (`.yaml`, `.json`, or `.polo`). The workflow is:

1. **Outside the lab**, run `coco compile` (or `cargo run -- compile`) to produce the manifest file — its path and format come from your `coco.nut` `[target.moi]` section (default: `<module>.yaml`).
2. **Inside the lab**, load that manifest with `compile <Name> from manifest(<path>)`.

The bare `compile <Name>` form and the `compile <Name> from coco("./file.coco")` form are **not reliable** — they depend on path resolution from a specific project root and tend to fail in nested or relocated projects. Avoid them in scripts, documentation, and agent workflows.

For lab scripts driven by `coco.nut`, either (a) add `coco compile` as a prerequisite step in your `[scripts]` bash entry before calling `coco lab run`, or (b) point `from manifest(...)` at a pre-built fixture checked into the project.

### Register Users

```
register alice                      // auto-generated address
register bob as 0x1234...           // specific address
register X                          // a "neutral" caller for read-only queries
users                               // list all registered users
```

### Set Defaults

```
set default.sender alice            // all subsequent calls use alice
set default.basefuel 5000           // set fuel (effort) limit for all executions
get default.sender                  // check current default
get default.basefuel                // check current basefuel (default: 100000)
wipe default.sender                 // clear default sender
```

### Deploy

Run the deploy endpoint to initialize logic state:

```
deploy MyToken.SeedSupply(supply: 1000, seed: alice) as alice
deploy MyToken.SeedSupply(supply: 1000, seed: alice) as alice fuel 50000
```

Format: `deploy <Logic>.<Endpoint>(<args>) [as <sender>] [with <participants>] [fuel <N>]`

### Enlist

Run the enlist endpoint to initialize an actor:

```
enlist MyToken.Register() as bob
enlist MyToken.Register() as bob fuel 50000
```

Format: `enlist <Logic>.<Endpoint>(<args>) [as <sender>] [with <participants>] [fuel <N>]`

### Invoke

Call any endpoint:

```
invoke MyToken.GetBalance(account: alice)
invoke MyToken.Transfer(to: bob, amount: 100) as alice
invoke MyToken.GetName()
invoke MyToken.Transfer(to: bob, amount: 100) as alice fuel 200000
```

Format: `invoke <Logic>.<Endpoint>(<args>) [as <sender>] [with <participants>] [fuel <N>]`

**Argument types in invoke commands:**

```
# Strings — escaped quotes in TOML, plain in interactive mode
invoke Logic.Func(name: "hello") as alice

# Numbers
invoke Logic.Func(amount: 100, big: 1773412350) as alice

# Identifiers — use registered user names directly
invoke Logic.GetData(actor_id: rahul) as X

# Arrays
invoke Logic.Func(items: []String{"FOOD", "HEALTH"}) as alice

# Complex types
invoke Logic.Func(point: math::Point{coords: [3]U64{1, 2, 3}}) as alice
```

### Observe State

Read state fields directly:

```
observe MyToken.Logic.supply
observe MyToken.alice.balance           // alice's actor state
observe MyToken.Logic.balances
```

Format: `observe <Logic>.<StateClass>.<field>`

### Memory Variables

Store values for reuse:

```
set myaddr = 0x1234...
get myaddr                             // retrieve value
wipe myaddr                            // delete variable
```

### Events

Query emitted events:

```
get events                              // all events
get events.TransferEvent                // specific event type
get events from <logic_id>             // from specific logic
get events of <tx_hash>                // from specific transaction
get events on <address>                // on specific address
get events with {topic1, topic2}       // filter by topics
```

Events emitted during a `deploy` / `invoke` / `enlist` are also printed inline
in that command's result, directly below the `Execution Complete!` line. They are
shown **even when the execution errors** (e.g. a `throw`/`revert` or `meter
exhausted`), so you can see what a failing transaction emitted before it aborted.
Use `get events` afterward to re-query them with filters.

### Create (Assets)

Create an asset on an asset logic:

```
create MAS0(symbol: "BTC", decimals: 18, manager: alice, max_supply: 1000000, enable_events: true) as alice
```

Format: `create <Logic>(<args>) [as <sender>]`

Parameters: `symbol` (String), `decimals` (U64), `manager` (Identifier), `max_supply` (U256), `enable_events` (Bool).

The Sender (specified with `as`) automatically becomes the asset creator. This calls the asset creation process for asset logics (`coco asset`).

### Participants

In MOI/PISA, each actor's data (storage, asset balances) belongs to them. When an operation touches multiple actors' data, **all affected actors must be explicitly included as participants** in the transaction — otherwise the runtime cannot access their storage or asset balances.

Use the `with` keyword to list participants (comma-separated, no brackets):

```
invoke Swap.Execute() as alice with bob
deploy Swap.Init() as alice with bob, charlie
```

**When are participants needed?**
- Any `mutate` on another actor's state → that actor must be a participant
- Cross-logic calls that touch other actors' state

**Note on asset engine operations:** In Cocolab, asset engine operations like `asset.Transfer()` handle participant resolution automatically — you do **not** need `with` for basic asset transfers. The asset engine manages the beneficiary's balance internally.

#### Participant Access Levels

Each participant can have an access level set with `/`:

| Level | Description |
|-------|-------------|
| `/write` | Full read/write access (default if no level specified) |
| `/read` | Read-only access — can observe but not mutate their state |
| `/none` | Participant is present but grants no storage access |

```
invoke Logic.Func() as alice with bob/write, charlie/read
```

### Other Commands

| Command | Description |
|---------|-------------|
| `logics` | List compiled logics |
| `engines` | List available execution engines |
| `users` | List registered users |
| `wipe users` | Delete all users |
| `wipe logics` | Delete all logics |
| `wipe defaults` | Reset defaults |
| `storagekey <slot> [idx/fld/key(...)]` | Calculate storage key hash |
| `docencode <data>` | Encode data to POLO format |
| `docdecode <hex>` | Decode POLO hex data |
| `errdecode <code> [from <engine>]` | Decode error codes |
| `exit` | Exit the REPL |

---

## Persistence

Cocolab automatically persists the full environment state between sessions. When you exit the REPL (or press Ctrl-C / Ctrl-D), a snapshot is saved. When you restart, the previous session's state is restored — including compiled logics, registered users, deployed state, memory variables, events, default sender, basefuel, storage disks, and assets.

### How It Works

- **Storage backend**: `FileStorage` stores snapshots as binary files under `~/.coco/lab/environment/{env}/{timestamp}.snap`.
- **File format**: Each `.snap` file has a `CLAB` magic header, a version string, and a POLO-encoded payload containing the full `EnvironmentSnapshot`.
- **Auto-save**: A snapshot is written on every REPL exit (normal exit, Ctrl-C, Ctrl-D). In `coco lab init` and `coco lab run`, a snapshot is written after the batch completes.
- **Auto-restore**: On startup, the most recent snapshot is loaded and restored (unless `--new-session` or `--no-persist` is used).
- **Banner**: The REPL banner shows the persistence status: `Restored (2026-03-30 14:30:22)`, `New Session`, or `Disabled`.

### CLI Flags for Persistence

| Flag | Effect |
|------|--------|
| (default) | Restore from latest snapshot on start, auto-save on exit |
| `--new-session` | Ignore saved snapshots (start fresh), but still save on exit |
| `--no-persist` | Disable all persistence — no restore, no save |

### What Is Persisted

The snapshot includes:
- All compiled logics (with manifests, state, deploy status, asset descriptors)
- All registered users and their addresses
- All accounts and their data
- Storage disks (persistent state)
- Asset holdings
- Events
- Default sender and basefuel
- Memory variables (`set myvar = value`)

### coco.nut Storage Configuration

Storage can also be configured in `coco.nut`:

```toml
[lab]
storage = "file"             # storage backend (currently only "file")
storage_path = "/custom/path" # override default ~/.coco/lab/environment
```

CLI flags always take priority over `coco.nut` settings.

---

## Fuel / Effort Limit

Every PISA execution (deploy, invoke, enlist) consumes **fuel** (also called **effort**). Fuel limits prevent runaway execution. When fuel is exhausted, the runtime returns a `meter exhausted` error.

### Default Basefuel

The default fuel limit is **100,000**. This applies to all executions unless overridden.

```
get default.basefuel                // shows current basefuel (default: 100000)
set default.basefuel 500000         // increase for complex operations
set default.basefuel 1000           // decrease for testing fuel limits
```

The basefuel value is persisted in snapshots.

### Explicit Fuel on Commands

You can override the basefuel for a single command by appending `fuel <N>`:

```
deploy Logic.Init() as alice fuel 200000
invoke Logic.Compute() as alice fuel 500000
enlist Logic.Register() as bob fuel 50000
```

Explicit fuel **overrides** the default basefuel for that specific execution. If the default basefuel is set very low (e.g., 1), you can still run expensive operations by providing a high explicit fuel value.

### Fuel Reporting

Execution results always show the fuel consumed:
- **On success**: `Execution Complete! [12345 FUEL] [0xabcdef...]`
- **On error**: `error: meter exhausted [99993 FUEL]`

### CLI Flag

The `-f <fuel>` flag sets the initial basefuel when starting the REPL:

```bash
coco lab start -f 500000
```

This is equivalent to running `set default.basefuel 500000` as the first command.

---

## Scripted Testing with `coco lab run`

For automated testing, define lab scripts in `coco.nut` under `[lab.scripts]`. Each script is an **ordered array of Cocolab commands** that execute sequentially, preserving state between commands.

State also persists **across separate `coco lab run` invocations** that share the same storage location (default `~/.coco/lab/environment`, or whatever `--storage-path` / `coco.nut`'s `lab.storage_path` points to). Each run restores the latest snapshot before executing its script and writes a new snapshot after the batch completes, so a later run sees the compiled logics, registered users, deployed state, memory variables, and default sender left behind by an earlier one. Use `--new-session` to ignore the prior snapshot (but still save on exit) or `--no-persist` to disable both restore and save — e.g. for a fully hermetic test run, point `--storage-path` at a fresh `mktemp -d` directory.

### Defining Lab Scripts

In `coco.nut`:

```toml
[lab.scripts]
test-my-logic = [
    # Step 1: Compile the logic
    "compile MyLogic from manifest(mylogic.json)",

    # Step 2: Register users
    "register alice",
    "register bob",

    # Step 3: Deploy
    "deploy MyLogic.Init(supply: 1000) as alice",

    # Step 4: Test endpoints
    "invoke MyLogic.Transfer(to: bob, amount: 100) as alice",
    "invoke MyLogic.GetBalance(actor_id: alice)",
    "invoke MyLogic.GetBalance(actor_id: bob)",
]
```

### Running Lab Scripts

```bash
coco lab run test-my-logic
```

This executes all commands in order and prints the output of each. The output goes to stdout and can be captured.

### String Arguments in TOML

Because lab scripts live inside TOML strings, string arguments need **escaped quotes**:

```toml
[lab.scripts]
test = [
    # String args use escaped quotes inside TOML strings
    "invoke Logic.SetName(category: \"FOOD\", ref: \"fish\") as alice",

    # Array of strings
    "invoke Logic.Create(items: []String{\"FOOD\", \"HEALTH\"}) as alice",

    # Numbers don't need quotes
    "invoke Logic.Set(amount: 100, timestamp: 1773412350) as alice",

    # Identifiers — use registered usernames directly
    "invoke Logic.Get(actor_id: alice) as X",
]
```

### Lab Script Patterns

**Pattern: Neutral reader user.** For endpoints that read `Sender` state (e.g., `observe <- Module.Sender.field`), use a neutral user so the caller's state isn't inadvertently modified:

```toml
"register X",
"set default.sender X",
"invoke Logic.GetMyData()",                             # reads X's (empty) actor state safely
"invoke Logic.Transfer(to: bob, amount: 100) as alice", # override for writes
```

For endpoints that take an explicit `actor_id` parameter (like `GetBalance(account: alice)`), any sender works — no need for a neutral user.

**Pattern: Multi-user state progression.** Set up state for multiple users, then verify:

```toml
# Set state for alice
"invoke Logic.Set(category: \"FOOD\", ref: \"fish\") as alice",
"invoke Logic.Set(category: \"HEALTH\", ref: \"vitals\") as alice",

# Set state for bob
"invoke Logic.Set(category: \"FOOD\", ref: \"milk\") as bob",

# Read back — these take actor_id so any sender works
"invoke Logic.Get(actor_id: alice, category: \"FOOD\")",
"invoke Logic.Get(actor_id: bob, category: \"FOOD\")",
```

**Pattern: State transitions.** Test a workflow like request → approve → use → revoke:

```toml
# Create
"invoke Logic.CreateRequest(session_id: \"sess1\", agent_id: \"agent007\") as alice",
"invoke Logic.GetSession(actor_id: alice, session_id: \"sess1\")",

# Approve
"invoke Logic.Approve(session_id: \"sess1\", expires_at: 1773416000) as alice",
"invoke Logic.GetSession(actor_id: alice, session_id: \"sess1\")",

# Use
"invoke Logic.Consume(session_id: \"sess1\") as alice",
"invoke Logic.GetSession(actor_id: alice, session_id: \"sess1\")",

# Revoke
"invoke Logic.Revoke(session_id: \"sess1\", reason: \"done\") as alice",
"invoke Logic.GetSession(actor_id: alice, session_id: \"sess1\")",
```

**Pattern: Expected errors.** Include invocations that should fail — the error output can be verified in the bash test:

```toml
# This should fail with "Session already exists"
"invoke Logic.CreateRequest(session_id: \"sess1\", agent_id: \"other\") as alice",
```

---

## Automated Test Verification with `coco nut run`

The `[scripts]` section in `coco.nut` defines **bash commands** that can run lab scripts and verify their output using grep or any other shell tool. This is the full integration testing pattern.

### Defining Bash Test Scripts

```toml
[scripts]
build = "coco compile"
clean = "rm -rf ./build"
test = '''
PASS=0
FAIL=0
TEST_RESULTS=$(coco lab run test-my-logic 2>&1)

# Check a specific output value
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

### Running Bash Test Scripts

```bash
coco nut run test
```

This executes the bash script defined under `[scripts].test`. It:
1. Runs `coco lab run test-my-logic` and captures all output
2. Uses `grep -q` to check for expected patterns in the output
3. Tracks PASS/FAIL counts
4. Exits with code 1 if any test fails (useful for CI)

### The Verification Pattern

The key technique: **capture lab output, then grep for expected patterns.** Never print the full captured output — only print PASS/FAIL lines and the final summary.

```bash
# 1. Capture all lab output into a variable
TEST_RESULTS=$(coco lab run <script-name> 2>&1)

# 2. Check for expected output patterns
echo "$TEST_RESULTS" | grep -q '<expected_pattern>' \
    && { echo 'PASS: <test_name>'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: <test_name>'; FAIL=$((FAIL+1)); }
```

### Grep Patterns for Cocolab Output

Lab output for classes/maps uses a specific format. The grep patterns must match this format:

```bash
# Class field — output is map[Field1:val1 Field2:val2 ...]
# Fields appear in ALPHABETICAL order within the map
echo "$TEST_RESULTS" | grep -q 'cat_ref:map\[Category:FOOD Exists:true Ref:fish\]'

# Multiple class fields — use .* for flexible matching
echo "$TEST_RESULTS" | grep -q 'intel_obj:.*Ref:sushi.*Ref:vitals.*Version:6'

# Array of classes — fields inside brackets
echo "$TEST_RESULTS" | grep -q 'result:\[.*Ref:fish.*Ref:vitals.*Ref:card'

# Boolean result
echo "$TEST_RESULTS" | grep -q 'result:map\[Reason:valid Valid:true\]'

# Simple scalar
echo "$TEST_RESULTS" | grep -q 'ver:5'
echo "$TEST_RESULTS" | grep -q 'last_updated:1773412352'

# Error message (from a throw)
echo "$TEST_RESULTS" | grep -q 'Session already exists with this ID'

# Status field within a class
echo "$TEST_RESULTS" | grep -q 'SessionId:sess1 Status:ACTIVE'
echo "$TEST_RESULTS" | grep -q 'RemainingUses:4.*SessionId:sess1 Status:ACTIVE'

# Revocation reason
echo "$TEST_RESULTS" | grep -q 'RevocationReason:no longer needed SessionId:sess1 Status:REVOKED'
```

**Important:** Class fields are printed in **alphabetical order** within `map[...]`. Plan your grep patterns accordingly.

### Multi-Line Scripts in TOML

Use triple-quoted strings for multi-line bash scripts:

```toml
[scripts]
test = '''
PASS=0
FAIL=0
TEST_RESULTS=$(coco lab run my-test-script 2>&1)

echo "$TEST_RESULTS" | grep -q 'expected_pattern' \
    && { echo 'PASS: test name'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: test name'; FAIL=$((FAIL+1)); }

echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
'''
```

### Complete Real-World Example

This is a condensed version of a production test from a Participant Intelligence Service:

```toml
[lab.scripts]
test-intelligence = [
    "compile Intelligence from manifest(intelligence.json)",
    "register rahul",
    "register robert",

    # --- Set categories for two users ---
    "invoke Intelligence.SetCategoryRef(category: \"FOOD\", ref: \"fish\", schema_version: \"1.1\", updated_at: 1773412350) as rahul",
    "invoke Intelligence.SetCategoryRef(category: \"HEALTH\", ref: \"vitals\", schema_version: \"1.0\", updated_at: 1773412350) as rahul",
    "invoke Intelligence.SetCategoryRef(category: \"FOOD\", ref: \"milk\", schema_version: \"1.2\", updated_at: 1773412351) as robert",

    # --- Read back (actor_id is explicit, any sender works) ---
    "invoke Intelligence.GetCategoryRef(actor_id: rahul, category: \"FOOD\")",
    "invoke Intelligence.ListCategoryRefs(actor_id: rahul)",

    # --- Version tracking ---
    "invoke Intelligence.GetVersion(actor_id: rahul)",

    # --- Session lifecycle ---
    "invoke Intelligence.CreateSessionRequest(session_id: \"sess1\", agent_id: \"agent007\", purpose: \"food_ordering\", approved_categories: []String{\"FOOD\"}, approved_scopes: []String{\"read\"}, requested_uses: 5, ttl_seconds: 3600, approval_ref: \"ref001\") as rahul",
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\")",

    # --- Duplicate should fail ---
    "invoke Intelligence.CreateSessionRequest(session_id: \"sess1\", agent_id: \"agent099\", purpose: \"duplicate\", approved_categories: []String{\"FOOD\"}, approved_scopes: []String{\"read\"}, requested_uses: 1, ttl_seconds: 100, approval_ref: \"dup\") as rahul",

    # --- Approve and validate ---
    "invoke Intelligence.ApproveSession(session_id: \"sess1\", issued_at: 1773412400, expires_at: 1773416000, remaining_uses: 5, approval_ref: \"ref001\") as rahul",
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\")",
    "invoke Intelligence.ValidateSession(actor_id: rahul, session_id: \"sess1\", agent_id: \"agent007\", required_categories: []String{\"FOOD\"}, required_scopes: []String{\"read\"}, current_time: 1773412500)",

    # --- Consume and check ---
    "invoke Intelligence.ConsumeSessionUse(session_id: \"sess1\", current_time: 1773412500) as rahul",
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\")",

    # --- Revoke ---
    "invoke Intelligence.RevokeSession(session_id: \"sess1\", revocation_reason: \"no longer needed\") as rahul",
    "invoke Intelligence.GetSession(actor_id: rahul, session_id: \"sess1\")",
]

[scripts]
test = '''
PASS=0
FAIL=0
TEST_RESULTS=$(coco lab run test-intelligence 2>&1)

# Verify category data
echo "$TEST_RESULTS" | grep -q 'cat_ref:map\[Category:FOOD Exists:true LastUpdated:1773412350 Ref:fish SchemaVersion:1.1\]' \
    && { echo 'PASS: GetCategoryRef rahul FOOD'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: GetCategoryRef rahul FOOD'; FAIL=$((FAIL+1)); }

# Verify session states
echo "$TEST_RESULTS" | grep -q 'SessionId:sess1 Status:REQUESTED' \
    && { echo 'PASS: Session REQUESTED'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: Session REQUESTED'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'Session already exists with this ID' \
    && { echo 'PASS: Duplicate rejected'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: Duplicate rejected'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'RemainingUses:5.*SessionId:sess1 Status:ACTIVE' \
    && { echo 'PASS: Session ACTIVE'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: Session ACTIVE'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'result:map\[Reason:valid Valid:true\]' \
    && { echo 'PASS: Validation valid'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: Validation valid'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'RemainingUses:4.*SessionId:sess1 Status:ACTIVE' \
    && { echo 'PASS: Consume remaining=4'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: Consume remaining=4'; FAIL=$((FAIL+1)); }

echo "$TEST_RESULTS" | grep -q 'RevocationReason:no longer needed SessionId:sess1 Status:REVOKED' \
    && { echo 'PASS: Session REVOKED'; PASS=$((PASS+1)); } \
    || { echo 'FAIL: Session REVOKED'; FAIL=$((FAIL+1)); }

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
'''
```

### Lab Render Configuration

Control output formatting in `coco.nut`:

```toml
[lab.render]
big_int_as_hex = true     # Display U256 as hex
bytes_as_hex = false       # Display bytes as raw
```

---

## Interactive Example Sessions

### Regular Logic (Flipper)

```
$ coco compile                                # produce flipper.yaml first
$ coco lab start
> compile Flipper from manifest(flipper.yaml)
  ✓ Compiled Flipper

> register alice
  ✓ Registered alice

> set default.sender alice

> deploy Flipper.Seed(initial: true) as alice
  ✓ Deployed

> invoke Flipper.Mode()
  value: true

> invoke Flipper.Flip() as alice
  ✓ OK

> invoke Flipper.Mode()
  value: false

> observe Flipper.Logic.value
  false

> exit
```

### Asset Logic (MAS0 — ERC20-equivalent)

Multi-user asset workflow with `create`, minting, and transfers:

```
$ coco lab start
> register alice
  ✓ Registered alice

> register bob
  ✓ Registered bob

> set default.sender alice

> compile AnAsset from manifest(standards/mas0/mas0.yaml)
  ✓ Compiled AnAsset

> create AnAsset(symbol: "BTC", decimals: 18, manager: alice, max_supply: 1000000, enable_events: true) as alice
  ✓ Created

> invoke AnAsset.Mint(beneficiary: alice, amount: 1000) as alice
  ✓ OK

> invoke AnAsset.Transfer(beneficiary: bob, amount: 10) as alice
  ✓ OK

> invoke AnAsset.BalanceOf(address: alice)
  Execution Outputs ||| balance:990

> invoke AnAsset.BalanceOf(address: bob)
  Execution Outputs ||| balance:10

> exit
```
