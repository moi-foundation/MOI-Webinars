# Coco Language Skills

> **For AI agents and developers.** Drop this folder into any Coco project to teach your AI assistant the language.

Coco is an **Interaction-Oriented Smart Contract Programming Language** targeting the PISA runtime. It compiles `.coco` source files into deployable manifests.

## Quick Start Template

**Design principle:** Keep data with participants (`state actor`), not with the logic. Logic state requires locking and blocks parallel execution. Actor state enables millions of users to operate simultaneously.

```coco
coco MyModule

// state logic — only for shared config (avoid for per-user data!)
state logic:
    name String

// state actor — per-participant data (preferred for all user data)
state actor:
    balance U64

endpoint deploy Init(name String):
    mutate name -> MyModule.Logic.name

endpoint enlist Register():
    mutate U64(0) -> MyModule.Sender.balance

endpoint dynamic Transfer(to Identifier, amount U64):
    mutate bal <- MyModule.Sender.balance:
        if bal < amount:
            throw "Insufficient balance"
        bal -= amount
    mutate to_bal <- MyModule.Actor(to).balance:
        to_bal += amount

endpoint static GetBalance() -> (balance U64):
    observe balance <- MyModule.Sender.balance
```

## Syntax Cheat Sheet

| Construct | Syntax |
|-----------|--------|
| Module | `coco ModuleName` |
| Package | `coco package pkgname` |
| Import | `imports: "./path"` or `alias "./path"` |
| State | `state logic:` / `state actor:` |
| Endpoint | `endpoint [deploy\|enlist] [dynamic\|static\|pure] Name(args) -> (outs):` |
| Function | `function Name(args) -> (outs):` |
| Class | `class Name:` with `field name Type` and `method Name():` |
| Event | `event Name:` with `topic name Type` / `field name Type` |
| Interface | `interface Name:` with `state logic:` / `endpoint:` / `asset:` sections |
| Variable | `memory x = value` / `memory x Type` / `const X Type = value` |
| Read state | `observe var <- Module.Logic.field` |
| Write state | `mutate value -> Module.Logic.field` or `mutate var <- Module.Logic.field: ...` |
| Read complex | `gather local <- storage_var` (inside observe block) |
| Write complex | `disperse storage_var <- local` (inside mutate block) |
| Call function | `result = (out) <- FuncName(arg: val)` |
| Array literal | `[]U64{1, 2, 3}` / `[3]U64{1, 2, 3}` / nested: `[][]U64{{1}, {2, 3}}` |
| Map literal | `Map[String]U64{"a": 1, "b": 2}` |
| Class literal | `Person{name: "Alice", age: 32}` (omitted fields default to zero) |
| Brace-elided nested | `[]Person{{name: "A"}}` / `Map[String]Box{"k": {val: 7}}` |
| F-string | `f"Hello {name}, you have {balance}"` |
| Ternary | `(value if condition else fallback)` |
| Key check | `map[key]?` returns `Bool` |
| Loop | `for i, val in collection:` / `for i in range(n):` |
| Throw | `throw "message"` or `throw f"error: {details}"` |
| Emit event | `emit EventName{field: val}` or `emit obj -> Sender` |

## Types

| Type | Description | Zero Value |
|------|-------------|------------|
| `Bool` | `true` / `false` | `false` |
| `String` | Text | `""` |
| `Bytes` | Byte sequence | `0x` |
| `Identifier` | 32-byte address | `0x00...00` |
| `U64` | Unsigned 64-bit int | `0` |
| `I64` | Signed 64-bit int | `0` |
| `U256` | Unsigned 256-bit int | `0x` |
| `[]Type` | Variable-length array | empty |
| `[N]Type` | Fixed-length array | zero-filled |
| `Map[K]V` | Key-value map | empty |

## Naming Conventions

| Element | Style | Example |
|---------|-------|---------|
| Module | PascalCase | `MyToken` |
| Package | snake_case | `my_package` |
| Endpoint / Function | PascalCase | `GetBalance` |
| Class / Event | PascalCase | `TokenInfo` |
| Variable / Argument | snake_case | `user_balance` |
| Constant | ALL_CAPS | `MAX_SUPPLY` |
| File | snake_case | `my_token.coco` |

## Key Rules for AI Agents

1. **Prefer `state actor` over `state logic`** — this is the most important design rule. Actor state stores data with each participant, enabling **parallel execution**. Logic state is a shared central location that requires locking and forces sequential access. Use `state logic` only for truly shared configuration (e.g., token name, owner address). Put all per-user data in `state actor`.
2. **Indentation is significant** — Python-style, use 4 spaces consistently. A colon `:` starts an indented block.
3. **All state access goes through observe/mutate** — you cannot read or write state variables directly.
4. **Module name is a superglobal** — `MyModule.Logic.field`, `MyModule.Sender.field`, `MyModule.Actor(id).field`.
5. **Arguments are read-only, return values are write-only** — never reassign function inputs or read return vars before setting them.
6. **Use `disperse`/`gather` for complex types** — maps, arrays, and classes in state need explicit transfer.
7. **`deploy` runs once at deployment, `enlist` runs once per actor** — use them for initialization only.
8. **`dynamic` = writes state, `static` = reads state, `pure` = no state** — match the qualifier to what your endpoint does.
9. **No `while` loops** — only `for ... in` over finite sequences. Use `range(n)` for counted loops.
10. **Named return values** — all outputs are named in the signature. Set them with `yield`, `=`, or `return (name: value)`.
11. **Function calls use capture syntax** — `result = (out) <- FuncName(arg: val)` to get return values.
12. **Always verify generated code** — after writing or modifying `.coco` files, run `coco compile` to check it compiles, then run `coco test <module>` or `coco nut run test` (if configured in `coco.nut`) to verify correctness before presenting the code to the user.
13. **Keep `coco.nut` test scripts clean** — in `[scripts]` bash sections: (a) never use `echo "$TEST_RESULTS"` or print the full captured output — only print PASS/FAIL lines and the final summary; (b) if `coco nut run` prints "Failed to execute script" followed by the entire script source, it means the bash script has a syntax error or TOML quoting issue — fix the script, don't just re-run it.

## Detailed References

| File | Topics |
|------|--------|
| [reference/01-language-basics.md](reference/01-language-basics.md) | Modules, variables, types, operators, indentation |
| [reference/02-state-and-access.md](reference/02-state-and-access.md) | State declaration, observe/mutate, gather/disperse, sweep |
| [reference/03-endpoints-and-functions.md](reference/03-endpoints-and-functions.md) | Endpoints, functions, qualifiers, return/yield, call syntax |
| [reference/04-classes-and-events.md](reference/04-classes-and-events.md) | Classes, fields, methods, special methods, events, emit |
| [reference/05-collections.md](reference/05-collections.md) | Arrays, maps, append/popend/merge/remove, make, haskey |
| [reference/06-control-flow.md](reference/06-control-flow.md) | if/else, switch/case, for loops, range, break/continue, throw |
| [reference/07-interfaces.md](reference/07-interfaces.md) | Interfaces, cross-logic calls, reading external state |
| [reference/08-native-assets.md](reference/08-native-assets.md) | Asset engine, MAS0/MAS1/MAS2 standards, `asset.*` methods |
| [reference/09-modules-and-imports.md](reference/09-modules-and-imports.md) | Packages, imports, pub visibility, :: syntax, coco.nut |
| [reference/10-strings-and-builtins.md](reference/10-strings-and-builtins.md) | Strings, f-strings, bytes, crypto builtins, serialization |
| [reference/11-testing-patterns.md](reference/11-testing-patterns.md) | Inline tests, lab script integration tests, coco test |
| [reference/12-cocolab-repl.md](reference/12-cocolab-repl.md) | REPL commands, `coco lab run` scripts, `coco nut run` bash verification |
| [reference/13-common-patterns.md](reference/13-common-patterns.md) | Token ledger, guard functions, CRUD, MAS0, swaps, security patterns |
| [reference/14-error-reference.md](reference/14-error-reference.md) | Parser, type, scope, state, and Cocolab errors with causes and fixes |
| [reference/15-project-setup.md](reference/15-project-setup.md) | Full project lifecycle: init → code → compile → test → deploy |
| [AGENTS.md](AGENTS.md) | Code style, naming, workflow, security checklist for AI agents |

### Runnable Examples

The `examples/` folder contains compilable `.coco` files that demonstrate key patterns:

| File | Demonstrates |
|------|-------------|
| [examples/flipper.coco](examples/flipper.coco) | Simplest stateful logic — deploy, mutate, observe |
| [examples/token_ledger.coco](examples/token_ledger.coco) | Logic + actor state, deploy, enlist, transfer with balance checks |
| [examples/crud_registry.coco](examples/crud_registry.coco) | Classes, maps, events, gather/disperse, CRUD operations |
| [examples/asset_token.coco](examples/asset_token.coco) | MAS0-style fungible asset logic with asset engine |
| [examples/cross_logic.coco](examples/cross_logic.coco) | Interface-based cross-logic calls and state reading |

### MOI Asset Standards (drop-in ready)

The `standards/` folder hosts the canonical MAS reference implementations. Each lives in its own compilable mini-project (`.coco` source + `coco.nut`) — run `coco compile` inside the folder to produce the manifest, then load it in Cocolab with `compile <Name> from manifest(<file>.yaml)`.

| Standard | Project | Equivalent | Type |
|----------|---------|-----------|------|
| **MAS0** | [standards/mas0/mas0.coco](standards/mas0/mas0.coco) | ERC-20 | Fungible token |
| **MAS1** | [standards/mas1/mas1.coco](standards/mas1/mas1.coco) | ERC-721 | Non-fungible token |
| **MAS2** | [standards/mas2/mas2.coco](standards/mas2/mas2.coco) | ERC-1155 | Semi-fungible token |

See [reference/08-native-assets.md](reference/08-native-assets.md) for the full workflow (`create` + `invoke <Asset>.Init()` for MAS1/MAS2).

## How to Use These Skills

**With Claude Code:** Place this folder in your Coco project root. Add to your `CLAUDE.md`:
```
Read coco-skills/SKILLS.md for Coco language reference. For detailed topics, read the corresponding file in coco-skills/reference/.
```

**With other AI tools:** Include `SKILLS.md` in your system prompt. Reference detail files as needed.

**Testing generated code:**
```bash
coco compile                # Compile current module
coco test <module>          # Run inline tests (// < and // > comments)
coco lab start              # Interactive REPL for manual testing
coco lab run <script>       # Run a lab script from coco.nut [lab.scripts]
coco nut run <script>       # Run a bash script from coco.nut [scripts]
```

## External Resources

| Resource | URL | Description |
|----------|-----|-------------|
| Coco Compiler | `github.com/<org>/cocolang` | Compiler source code and tests |
| PISA Runtime | Built into compiler (`pisa/runtime/`) | Go-based execution engine |
| MAS0/1/2 Standards | `coco-skills/standards/mas0/`, `mas1/`, `mas2/` | Reference asset logic implementations (drop-in ready) |
| POLO Serialization | `github.com/sarvalabs/rs-polo` | Serialization format used by Coco |
| MOI Protocol | `moi.technology` | The blockchain platform Coco targets |
