# Coco Agent Guidelines

Best practices for AI agents working with the Coco codebase.

## Code Style

### Naming Conventions

| Element | Style | Example |
|---------|-------|---------|
| Module name | PascalCase | `MyToken`, `CrudRegistry` |
| Package name | snake_case | `my_package`, `simple_math` |
| Endpoint / Function | PascalCase | `GetBalance`, `Transfer` |
| Class / Event | PascalCase | `TokenInfo`, `TransferEvent` |
| Variable / Argument | snake_case | `user_balance`, `total_supply` |
| Constant | ALL_CAPS or PascalCase | `MAX_SUPPLY`, `TOKEN_COUNT` |
| File name | snake_case | `my_token.coco`, `crud_registry.coco` |

### Indentation

- **4 spaces**, never tabs
- A colon `:` starts an indented block (like Python)
- Blocks: `endpoint`, `function`, `state`, `class`, `event`, `if`, `for`, `switch`, `mutate`, `observe`

### File Structure

Order elements in `.coco` files as:

1. `coco ModuleName` declaration
2. `imports:` (if any)
3. `const` declarations
4. `class` definitions
5. `event` definitions
6. `state logic:` / `state actor:` blocks
7. `endpoint deploy` (initialization)
8. `endpoint enlist` (actor registration)
9. `endpoint dynamic` (state-writing endpoints)
10. `endpoint static` / unnamed (state-reading endpoints)
11. `function` helpers (private)

### State Design — Actor-First Principle

**Always prefer `state actor` over `state logic`.** This is the most critical architectural decision in Coco.

- `state actor` stores data with each participant → **parallel execution** (millions of users simultaneously)
- `state logic` stores data centrally → **sequential execution** (requires lock, users wait in line)

**Use `state logic` only for:** token name, owner/admin address, global configuration that rarely changes.
**Use `state actor` for:** balances, user records, preferences, history — anything per-user.

```coco
// BAD: per-user data in logic state (blocks parallelism)
state logic:
    balances Map[Identifier]U256

// GOOD: per-user data in actor state (parallel)
state actor:
    balance U256
```

### Endpoint Qualifier Selection

| Qualifier | When to use |
|-----------|-------------|
| `deploy` | One-time logic initialization |
| `enlist` | One-time per-actor initialization |
| `dynamic` | Writes logic/actor state via `mutate`, or calls `asset.Mint()`/`asset.Burn()` |
| `static` | Reads state via `observe` only |
| `pure` | No state access at all |
| (none) | Defaults to static behavior |

### Comments

- Use `//` for single-line comments
- Add inline test comments (`// <` / `// >`) for every public endpoint
- Don't over-comment obvious code

## Development Workflow

### Always Verify

After writing or modifying `.coco` files:

```bash
coco compile                   # Must pass — fix all errors before proceeding
coco test <module>             # Run inline tests if present
coco nut run test              # Run integration tests if configured
```

**Never present code to the user without verifying it compiles.**

### Test Script Rules

When writing `[scripts]` bash sections in `coco.nut`:

1. **Never echo full captured output** — only print PASS/FAIL lines and summary
2. **"Failed to execute script" = bash/TOML syntax error** — fix the script, don't re-run
3. **Escape string arguments in TOML** — use `\"` inside TOML strings
4. **Use triple-quoted strings** (`'''...'''`) for multi-line bash scripts
5. **Always exit with code 1 on failure** — enables CI integration

### Lab Script Rules

When writing `[lab.scripts]` in `coco.nut`:

1. Commands execute sequentially, preserving state
2. Register a neutral reader user (`X`) for read-only queries
3. Deploy before enlist, enlist before invoke
4. For asset logics: compile → create → invoke (no deploy)

## Error Handling Patterns

### Guard Functions

```coco
function RequireSender(expected Identifier):
    if Sender != expected:
        throw "Unauthorized: wrong sender"

function RequirePositive(amount U256):
    if amount == 0:
        throw "Amount must be positive"
```

### Access Control

```coco
state logic:
    owner Identifier

endpoint deploy Init():
    mutate Sender -> MyModule.Logic.owner

endpoint dynamic AdminOnly():
    observe owner <- MyModule.Logic.owner
    if Sender != owner:
        throw "Only owner can call this"
    // ... admin logic
```

### Input Validation

Always validate at endpoint boundaries:

```coco
endpoint dynamic SetValue(key String, value U64):
    if len(key) == 0:
        throw "Key cannot be empty"
    if value > 1000000:
        throw f"Value {value} exceeds maximum"
    // ... store value
```

## Security Considerations

1. **Validate all inputs at endpoint level** — never trust caller-provided data
2. **Check Sender identity** for privileged operations
3. **Check balances before transfers** — always verify sufficient funds
4. **Use `observe` for reads, `mutate` for writes** — never confuse them
5. **Don't expose internal state** — only return what callers need
6. **Guard against empty collections** — check before iterating or accessing
7. **Use `throw` to abort on invalid state** — fail loud, fail early

## Coco vs Other Smart Contract Languages

If you're familiar with Solidity/Move/Rust, here are key Coco differences:

| Concept | Solidity/Move | Coco |
|---------|--------------|------|
| State access | Direct field access | `observe`/`mutate` blocks with state paths |
| Complex state | Direct assignment | `gather`/`disperse` for classes, maps, arrays in state |
| Loops | `while`, `for` | Only `for ... in` over finite sequences |
| Error handling | `require`/`revert`/`abort` | `throw "message"` |
| Visibility | `public`/`private`/`internal` | `pub` keyword, everything else is private |
| Entry points | `function` with modifiers | `endpoint` with lifecycle (`deploy`/`enlist`) and state (`dynamic`/`static`/`pure`) qualifiers |
| Actor model | Single global state | Per-actor state (`state actor:`) + shared logic state (`state logic:`) |
| Asset operations | ERC standards in code | Built-in asset engine via `asset.*` superglobal |
| Testing | External test frameworks | Inline tests (`// <` / `// >`), Cocolab REPL, lab scripts |

## Pull Request / Code Review Checklist

- [ ] All `.coco` files compile with `coco compile`
- [ ] Inline tests pass with `coco test <module>`
- [ ] Lab scripts run successfully with `coco lab run <script>`
- [ ] Bash test verification passes with `coco nut run test`
- [ ] Endpoints have correct qualifiers (`dynamic` for writes, `static` for reads)
- [ ] Complex state access uses `gather`/`disperse`
- [ ] Input validation present at endpoint boundaries
- [ ] Privileged operations check `Sender` identity
- [ ] No unused variables or dead code
- [ ] Naming conventions followed
