# 01 — Language Basics

## Module Declaration

Every `.coco` file starts with a module declaration. All `.coco` files in the same folder must share the same module name.

```coco
coco MyModule
```

For packages (reusable libraries):
```coco
coco package math
```

For asset logics:
```coco
coco asset MyToken
```

## Indentation

Coco uses **Python-style indentation**. A colon `:` at the end of a line opens an indented block. Use **4 spaces** consistently. Never mix tabs and spaces (a TAB counts as 1 space).

```coco
endpoint Example():
    if true:
        memory x = 5
        if x > 3:
            emit "nested"
    else:
        emit "other"
```

One-liners are allowed for single statements:
```coco
if x > 5: throw "Too much"
else: emit "OK"
```

Multi-line statements — lines may continue wherever a space could be written:
```coco
function NameSupply(
    n String,
    s U256,
) -> (name String,
      supply U256):
    return (name: n, supply: s)
```

## Comments

Line comments only. No block comments.

```coco
// This is a comment
x = 5  // Inline comment

// Multi-line comments require
// double-slash on each line
```

Special test directives (ignored by compiler, used by `coco test`):
```coco
// < invoke TEST.FuncName(arg: value)
// > expected_output
```

## Variables

### `memory` — Temporary Variables

Exist only during the function/endpoint execution. Initialized to zero value if no value given.

```coco
// Single declaration
memory x = 42
memory name String              // zero value: ""
memory count U64 = 10           // explicit type + value

// Multiple same-type
memory a, b, c U64

// Destructured from function
memory a, b, c = MyFunc()
```

### Block Syntax (Syntax Grouping)

Both `memory` and `storage` declarations support block syntax to group multiple declarations:

```coco
memory:
    count = 0
    ids = []String{"foo", "bar"}
    limit = 2

storage:
    operator Operator
    balance U64
```

### `storage` — Efficient Pointers

Creates a pointer to stored data. Used for efficient access to complex state without full copy to memory.

```coco
storage operator Operator
observe operators <- MyModule.Logic.Operators:
    operator = operators[Sender]
```

### `const` — Module-Level Constants

Declared at the top level with explicit type. Available throughout the module.

```coco
const MAX_SUPPLY U256 = 500
const TOKEN_NAME String = "MyCoin"
const ADMIN Identifier = 0x1111111111111111111111111111111111111111111111111111111111111111
const ENABLED Bool = true
```

### `generate` — Auto-Initialize Map Keys

Inside mutate blocks, `generate` auto-creates missing map entries with zero values.

```coco
// Without generate (verbose)
if !counter[userId]?:
    counter[userId] = 0
counter[userId]++

// With generate (concise)
generate counter[userId]++

// Also works with memory declarations inside mutate
generate memory:
    old = votes[Sender][id]
generate votes[Sender][id]++
```

## Primitive Types

| Type | Description | Zero Value | Literal Examples |
|------|-------------|------------|------------------|
| `Bool` | Boolean | `false` | `true`, `false` |
| `String` | Text string | `""` | `"hello"`, `f"x={x}"` |
| `Bytes` | Byte sequence | `0x` | `0xaabb`, `Bytes("hello")` |
| `Identifier` | 32-byte address | `0x00..00` | `0x1111...1111` (64 hex chars) |
| `U64` | Unsigned 64-bit int | `0` | `42`, `1000000`, `0xff` |
| `I64` | Signed 64-bit int | `0` | `-10`, `I64(-5)` |
| `U256` | Unsigned 256-bit int | `0x` | `U256(500)`, `0x1A4` |

**Hex integer literals:** Numeric values can be written in hexadecimal with the `0x` prefix: `0xff`, `0x004142`. These are valid wherever integer literals are expected.

## Type Conversion

Cast between types using the type name as a function:

```coco
memory b = Bytes("Akash")           // String -> Bytes
memory id = Identifier(Bytes(b))    // Bytes -> Identifier
memory n = U64(some_i64)            // I64 -> U64
memory big = U256(42)               // U64 -> U256
memory s = String(some_bytes)       // Bytes -> String
memory flag = Bool(some_string)     // String -> Bool (empty string = false)
memory neg = I64(-10)               // Literal negative
```

### Type Conversion Table

| From \ To | Bool | Bytes | String | Identifier | U64 | I64 | U256 |
|-----------|------|-------|--------|------------|-----|-----|------|
| **Bool** | — | — | yes | — | yes | yes | yes |
| **Bytes** | yes | — | yes | yes | yes | yes | yes |
| **String** | yes | yes | — | yes | yes | yes | yes |
| **Identifier** | yes | yes | yes | — | — | — | yes |
| **U64** | yes | yes | yes | — | — | yes | yes |
| **I64** | yes | yes | yes | — | yes | — | yes |
| **U256** | yes | yes | yes | yes | yes | yes | — |

## Type Inspection

```coco
memory t = typeof(x)  // Returns type name as String, e.g. "U64"
```

## Operators

### Arithmetic
| Op | Description |
|----|-------------|
| `+` | Addition (also string/bytes concatenation) |
| `-` | Subtraction |
| `*` | Multiplication |
| `/` | Division |
| `%` | Modulo |
| `++` | Increment |
| `--` | Decrement |

### Comparison
| Op | Description |
|----|-------------|
| `==` | Equal |
| `!=` | Not equal |
| `<` | Less than |
| `<=` | Less or equal |
| `>` | Greater than |
| `>=` | Greater or equal |

### Logical
| Op | Description |
|----|-------------|
| `&&` | Logical AND |
| `\|\|` | Logical OR |
| `!` | Logical NOT |

### Bitwise
| Op | Description |
|----|-------------|
| `&` | Bitwise AND |
| `\|` | Bitwise OR |
| `^` | Bitwise XOR |
| `~` | Bitwise NOT |

### Assignment
| Op | Description |
|----|-------------|
| `=` | Assign |
| `+=` | Add-assign |
| `-=` | Subtract-assign |
| `*=` | Multiply-assign |
| `/=` | Divide-assign |
| `%=` | Modulo-assign |

### Other
| Op | Description |
|----|-------------|
| `?` | Map key existence check: `map[key]?` → `Bool` |
| `[]` | Subscript access: `arr[i]`, `map[key]`, `str[i]` |
| `[:]` | Slice: `arr[start:end]`, `str[start:end]` |
| `.` | Field/method access: `obj.field`, `obj.Method()` |
| `::` | Package member access: `pkg::Member` |

## Superglobals

These are always available:

| Name | Description |
|------|-------------|
| `ModuleName` | The module itself — used for state access paths (`Module.Logic.field`, `Module.Sender.field`, `Module.Actor(id).field`) |
| `Sender` | The `Identifier` of the original transaction sender (stays constant in cross-logic calls) |
| `Environment` | Runtime context: `.Timestamp()`, `.EffortCapacity()`, `.EffortAvailable()`, `.VolumeCapacity()`, `.VolumeAvailable()` |
| `Invocation` | Current invocation: `.ID()` → Identifier, `.Caller()` → Identifier. Also `Identifier(Invocation)` to convert |
| `Builtins` | Cryptographic functions: `.Sha256()`, `.Keccak()`, `.Blake2b()`, `.Sigverify()` |

See [10-strings-and-builtins.md](10-strings-and-builtins.md) for full method signatures and the Sender vs Caller distinction.
