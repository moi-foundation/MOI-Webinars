# 14 — Error Reference

Common errors encountered when writing, compiling, and testing Coco code. Use this to diagnose issues quickly.

## Parser Errors

These occur during lexing/parsing of `.coco` source files.

| Error | Cause | Fix |
|-------|-------|-----|
| `invalid token: <token>` | Unrecognized character or keyword | Check spelling, ensure no stray characters |
| `invalid de-dentation` | Indentation level decreased to a non-matching level | Use consistent 4-space indentation, align with a previous block |
| `missing type for: <name>` | Variable or parameter declaration without a type | Add type annotation: `memory x U64` not `memory x` |
| `missing name for: <context>` | Expected identifier missing | Add the required name |
| `invalid number: <value>` | Malformed numeric literal | Check hex prefix (`0x`), no leading zeros on decimals |
| `missing ending "` | Unclosed string literal | Add closing quote on the same line |
| `invalid escape character` | Unknown escape sequence in string | Valid escapes: `\\`, `\"`, `\n`, `\t`, `\r` |
| `unexpected { in string` | Unescaped `{` in a regular string (not f-string) | Use `{{` to escape, or use `f"..."` for interpolation |
| `unexpected } in string` | Unescaped `}` in f-string without matching `{` | Use `}}` to escape, or add the opening `{` |
| `Unrecognized token <token>` | LALRPOP parser hit an unexpected token | Check syntax around the reported location — often a missing colon, comma, or parenthesis |
| `list of expressions can only be used at the left side of an assignment` | Multiple values on right side | Use function call capture: `a, b = (x, y) <- Func()` |
| `lists have different lengths` | Destructuring assignment size mismatch | Match the number of variables to the number of values |

## Type Errors

These occur during codegen when types don't match.

| Error | Cause | Fix |
|-------|-------|-----|
| `type mismatch: expected type <X>, passed <Y>` | Incompatible types in operation | Cast explicitly: `U256(value)`, `U64(value)`, or fix the type |
| `invalid type: can't parse hex number` | Hex literal used where decimal expected | Use decimal literal or proper hex format |
| `array length mismatch: expected <N>, actual <M>` | Fixed-size array has wrong number of elements | Match the declared size: `[3]U64{1, 2, 3}` |

## Variable & Scope Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `variable not found: <name>` | Referenced variable doesn't exist in scope | Check spelling, ensure variable is declared before use |
| `<name> is not mutable` | Trying to modify an immutable variable | Variables in `observe` blocks are read-only; use `mutate` instead |
| `immutable: <name>` | Assigning to a read-only binding | Function arguments are read-only — copy to a `memory` variable first |
| `object is private, add 'pub' keyword: <name>` | Accessing a private item from another module | Add `pub` to the declaration in the source module |
| `can't use more than 256 registers` | Function is too complex for the register allocator | Break into smaller functions |

## State & Storage Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Can't store a non-dispersable value into variable '<name>': use 'disperse target <- source'` | Assigning a complex type (class, array, map) to state without `disperse` | Use `disperse state_var <- local_var` |
| `Can't append a non-dispersable value into stored variable '<name>'` | Appending complex type to stored collection | Use `disperse append` |
| `disperse of primitive value is not necessary` | Using `disperse` for a simple type (U64, Bool, etc.) | Use regular assignment: `mutate val -> Module.Logic.field` |
| `gather of primitive value is not necessary` | Using `gather` for a simple type | Use regular assignment in the observe block |
| `variable '<name>' is not declared as a pointer to storable value, use 'storage' in declaration` | Trying to store a non-storage variable | Declare with `storage`: `storage myvar Type` |
| `state slot already borrowed: <description>` | Trying to access the same state slot twice in one block | Restructure to access the slot once |
| `missing state: <description>` | Referenced state doesn't exist | Check the state declaration matches the access path |

## Function & Endpoint Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `function not found: <name>` | Calling a function that doesn't exist | Check spelling, ensure function is defined or imported |
| `<statement> can only be used in function` | Using `return`/`yield` outside a function body | Move the statement inside a function or endpoint |
| `control statement used outside of block` | `break`/`continue` outside a loop | Only use inside `for` loops |
| `missing deploy function` | Module has no deploy endpoint but one is expected | Add `endpoint deploy Init():` or check if deploy is actually needed |
| `missing enlist function` | Module expects enlist but none defined | Add `endpoint enlist Register():` if actor state is used |
| `invalid argument <details>` | Function called with wrong argument types or count | Check the function signature |

## Class & Event Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `class error: register is not a class` | Using a non-class value as a class | Ensure you're referencing a defined `class` type |
| `event error: <details>` | Invalid event definition or emission | Check event field types and emission syntax |
| `duplicate name: <name>` | Name already defined in the same scope | Rename one of the conflicting definitions |
| `duplicate import: <module>` | Same module imported twice | Remove the duplicate import |

## Version Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `<feature> is not supported in PISA version <current>, requires <required>` | Code uses a feature unavailable in the target PISA version | Update `[target.pisa] version` in `coco.nut` or use older syntax |
| `invalid version: <string>` | Version string in coco.nut is malformed | Use format `"0.7.0"` |

## `coco.nut` Configuration Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Error in coco.nut format: <error>` | Invalid TOML syntax | Check TOML formatting — quotes, brackets, indentation |
| `Missing [module] section in coco.nut file` | No `[module]` section | Add `[module]` with `name` and `version` fields |
| `No files found for module <name>` | Module name doesn't match any `.coco` files | Ensure `.coco` files exist and names match `[module].name` |
| `Cyclic dependency detected` | Circular package imports | Restructure dependencies to break the cycle |
| `File exists: <filename>` | `coco nut init` when `coco.nut` already exists | Delete existing file or use a different directory |

## Cocolab REPL Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `user already exists: <name>` | Registering a username that's taken | Use a different name |
| `var name <name> already used in <kind>` | Memory variable name collides with a logic or user name | Choose a different variable name |
| `Logic ID for logic name '<name>' not found` | Logic hasn't been compiled yet | Run `compile <name> from ...` first |
| `FAILED to compile <details>` | Source code has errors | Fix the `.coco` source and recompile |
| `Failed to deserialize yaml manifest` | Manifest file has invalid YAML/JSON | Validate the manifest format |
| `no field named <field>` | Observe/access on non-existent state field | Check the logic's state declaration for correct field names |
| `class not found: <name>` | Referencing an undefined class | Ensure the class is defined in the logic |
| `Sender not configured for the environment` | No default sender set | Run `set default.sender <user>` or use `as <user>` |
| `Failed to parse calldata: <error>` | Invalid syntax in invoke/deploy arguments | Check argument format — named args, proper types, escaped quotes in TOML |

## Cocolab Data Inconsistency

| Error | Cause | Fix |
|-------|-------|-----|
| `Manifest couldn't be found on the server for logic name <name>` | Cached logic is stale | Shut down API server, run `rm -rf ~/.coco/lab/badger/`, recompile |

## Common Gotchas

### 1. Forgot to disperse/gather complex types
```coco
// WRONG — will get "Can't store a non-dispersable value"
mutate balances <- Module.Logic.balances:
    balances = Map[String]U64{"a": 1}

// RIGHT
mutate balances <- Module.Logic.balances:
    disperse balances <- Map[String]U64{"a": 1}
```

### 2. Modifying function arguments
```coco
// WRONG — arguments are read-only
endpoint Calc(x U64) -> (result U64):
    x += 1        // Error: immutable
    result = x

// RIGHT — copy to memory first
endpoint Calc(x U64) -> (result U64):
    memory val = x
    val += 1
    result = val
```

### 3. Using wrong state path
```coco
// WRONG — Logic vs Actor confusion
observe val <- MyModule.Sender.supply    // supply is logic state, not actor state

// RIGHT
observe val <- MyModule.Logic.supply     // logic state
observe val <- MyModule.Sender.balance   // actor state
```

### 4. Missing `as` in Cocolab
```
// WRONG — who is the sender?
invoke Token.Mint(amount: 100)

// RIGHT
set default.sender alice
invoke Token.Mint(amount: 100)
// or
invoke Token.Mint(amount: 100) as alice
```

### 5. String escaping in TOML lab scripts
```toml
// WRONG — unescaped quotes
"invoke Logic.Func(name: "hello")"

// RIGHT — escaped quotes
"invoke Logic.Func(name: \"hello\")"
```

### 6. F-string brace escaping
```coco
// WRONG — literal braces in f-string
s = f"Set {1, 2, 3}"      // Error: unexpected expression

// RIGHT — escape braces
s = f"Set {{1, 2, 3}}"    // Literal: "Set {1, 2, 3}"
```
