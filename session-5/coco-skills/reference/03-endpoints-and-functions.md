# 03 — Endpoints and Functions

## Endpoints

Endpoints are the **public interface** of a Coco logic — callable from external transactions.

### Syntax

```
endpoint [lifecycle] [state_qualifier] Name(inputs) -> (outputs):
    body
```

### Lifecycle Qualifiers

| Qualifier | When It Runs | Use For |
|-----------|-------------|---------|
| `deploy` | Once, when logic is first deployed | Initializing logic state |
| `enlist` | Once per actor, on first interaction | Initializing actor state |
| *(none)* | Anytime, callable repeatedly | Normal operations |

### State Qualifiers

| Qualifier | Allowed State Ops | When to Use |
|-----------|-------------------|-------------|
| `pure` | None | No state access at all |
| `static` | `observe` only | Read-only endpoints |
| `dynamic` | `observe` and `mutate` | Endpoints that write state |

**Rule:** The qualifier must match what the endpoint actually does. If you `mutate`, you need `dynamic`. If you only `observe`, you need `static`. If neither, `pure` or omit it.

**Cross-logic calls count too.** State accessed *through an interface* propagates to the caller's qualifier: calling a `dynamic` interface endpoint (or any interface `asset` operation) requires `dynamic`; calling only `static` interface endpoints (with no `mutate` of your own) requires `static`. See [07-interfaces.md](07-interfaces.md#endpoint-qualifiers-propagate-across-interface-calls).

### Examples

```coco
// Deploy — runs once at deployment
endpoint deploy Init(supply U64):
    mutate supply -> Token.Logic.supply

// Enlist — runs once per new actor
endpoint enlist Register():
    mutate 0 -> Token.Sender.balance

// Dynamic — reads and writes state
endpoint dynamic Transfer(to Identifier, amount U64):
    mutate bal <- Token.Sender.balance:
        bal -= amount

// Static — read-only
endpoint static GetBalance() -> (balance U64):
    observe balance <- Token.Sender.balance

// Pure — no state access
endpoint Calculate(x U64) -> (result U64):
    result = x * 2

// Dynamic — used in Flipper pattern
endpoint dynamic Flip():
    mutate value <- Flipper.Logic.value:
        value = !value
```

## Named Inputs and Outputs

All parameters and return values must be named:

```coco
// Single return
endpoint GetName() -> (name String):
    name = "Alice"

// Multiple returns
endpoint GetInfo() -> (name String, age U64, active Bool):
    name = "Alice"
    age = 32
    active = true

// Multiple inputs with same type (rightward type propagation)
endpoint Transfer(from, to Identifier, amount U256):
    // from and to are both Identifier
```

## Functions

Functions are **private helpers** — only callable from within the same logic.

```coco
function max(a, b U64) -> (max U64):
    if a >= b:
        return (max: a)
    max = b

function NameSupply(n String, s U256) -> (name String, supply U256):
    return (name: n, supply: s)
```

### Function vs Endpoint

| Feature | `endpoint` | `function` |
|---------|-----------|------------|
| Callable from outside | Yes | No |
| Can use `deploy`/`enlist` | Yes | No |
| Can access state | Yes (with qualifier) | Yes (inherits caller's context) |
| Can call functions | Yes | Yes |
| Can call endpoints | No | No |

## Calling Functions — Capture Syntax

Function return values are captured using the `(output) <- FuncName(args)` syntax:

### Single Return Value

```coco
// Capture syntax
memory result = (max) <- max(a: 5, b: 3)

// If local variable name matches parameter name, shorthand works
memory num = 20
memory result = (result) <- Double(num)
```

### Multiple Return Values

```coco
// Capture multiple returns
memory a, b, c = A()

// Or with explicit capture
memory name, x = (name, x) <- N()

// Function definition
function A() -> (a, b, c U64):
    a = 1
    b = 2
    c = 3
```

### Calling in Expressions

```coco
// Use capture in any expression context
memory z = math::Complex{re: io2::NUM4, im: (y) <- io2::Y()}

// In conditions
if U64(point.coords[1]) != (four) <- math::four():
    throw "Not four"
```

### Method Calls with Capture

```coco
class Person:
    field name String
    method Name() -> (name String):
        name = (enhanced) <- enhance(n: self.name)

// Calling
memory p = Person{name: "Alice"}
memory n = (name) <- p.Name()
```

### Cross-Package Calls

```coco
// Call function from imported package
memory result = (sqrt) <- math::Sqrt(n: value)
memory y_arr = (y) <- io2::Y()
```

## Return vs Yield

### `yield` — Set Return Value, Continue Execution

```coco
endpoint GetData() -> (count U64, name String):
    yield count 42
    yield name "Alice"
    // execution continues after yield
    emit "Done"
```

#### Yield Variants

```coco
// Single value
yield count 42
yield name "Alice"

// Brace form — set multiple return values at once
yield {count: 42, name: "Alice"}

// From variable (yield out var_name)
yield out some_variable
```

### `return` — Set Values and Exit Immediately

```coco
endpoint CheckAll(items []U64) -> (valid Bool):
    for _, item in items:
        if item == 0:
            return (valid: false)  // exits immediately
    valid = true

// Also works with multiple values
function NameSupply(n String, s U256) -> (name String, supply U256):
    return (name: n, supply: s)
```

#### Return Variants

```coco
// Parenthesized named return (most common)
return (name: value, supply: amount)

// Bare return — exits without setting values (uses whatever was yielded/assigned)
return

// Single-name return without parens
return name value
```

### Direct Assignment — Same as Yield

```coco
endpoint GetName() -> (name String):
    name = "Alice"  // equivalent to: yield name "Alice"
```

### `pass` — Empty Body

```coco
endpoint DoNothing():
    pass
```

## Argument Rules

1. **Arguments are read-only** — you cannot modify input parameters:
```coco
function Bad(a U64) -> (out U64):
    a += 1      // ERROR: arguments are read-only
    out = a
```

2. **Return values are write-only** — you cannot read them before setting:
```coco
function Bad() -> (out U64):
    out = 5
    out += 1    // ERROR: return values are write-only after first set
```

3. **Named arguments at call site** — use `name: value`:
```coco
memory result = (max) <- max(a: 5, b: 3)
token.Transfer(to: recipient, amount: 100)
```

## Complete Example

```coco
coco Calculator

function max(a, b U64) -> (max U64):
    if a >= b:
        return (max: a)
    max = b

function min(a, b U64) -> (min U64):
    if a <= b:
        return (min: a)
    min = b

endpoint TstMax(a, b U64) -> (max U64):
    max = (max) <- max(a: a, b: b)

endpoint Clamp(value, lo, hi U64) -> (result U64):
    memory upper = (max) <- max(a: lo, b: value)
    result = (min) <- min(a: hi, b: upper)
```
