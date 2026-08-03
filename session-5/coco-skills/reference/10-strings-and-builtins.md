# 09 — Strings and Builtins

## String Basics

```coco
memory s = "hello"
memory empty = ""
memory empty2 = String()          // equivalent to ""
```

### Concatenation

```coco
memory a = "Akash"
memory b = "Manish"
memory c = a + b                   // "AkashManish"
```

### Indexing

```coco
memory s = "hello"
memory c = s[1]                    // "e" (returns single-char String)
```

### Setting by Index

```coco
memory s = "hello"
s[0] = "y"                        // s = "yello"
```

### Slicing

```coco
memory a = "Akash"
memory b = "Manish"
memory c = a[2] + b[0:2] + "Sarthak"   // "aMaSarthak"
```

### Length

```coco
memory l = len("hello")           // 5
```

### Joining Strings

```coco
// join() concatenates without separator
memory s = join("hello", "world") // "helloworld"

// Also works in loops:
function JoinNames(list []Person) -> (out String):
    memory s String
    for _, element in list:
        s = join(s, element.name)
    yield out s
```

### Empty String Concatenation

```coco
memory s = String()
memory c = "hello"
memory out = s + c                 // "hello"
```

## F-Strings

Formatted strings with expression interpolation:

```coco
// Simple variable
memory name = "Alice"
memory greeting = f"Hello {name}"            // "Hello Alice"

// Expressions
memory s = f"X={x}"                          // "X=123"
memory s2 = f"X={x}."                        // "X=123."
memory s3 = f"{x}=X"                         // "123=X"
memory s4 = f"{x}={x}"                       // "123=123"

// With concatenation
memory a = f"Akash{temp}"
memory b = f"Manish"
memory c = a + b                             // "AkashTestManish"

// In throw
throw f"User {name} is not authorized"
throw f"Expected u==6"
throw f"Balance {balance} is insufficient"

// In emit
emit f"Transferring {amount} tokens"
emit f"{agents[i].id}: {agents[i].name}"

// Empty f-string
memory s = f""                               // ""
```

### Brace Escaping for JSON-like Output

`{{` produces a literal `{` and `}}` produces a literal `}`. This makes
f-strings handy for emitting JSON. A class can implement `__str__` once,
and any f-string that interpolates an instance will call it automatically:

```coco
class Person:
    field name String
    field age U64

    method __str__() -> (s String):
        s = f"{{\"name\": \"{self.name}\", \"age\": {self.age}}}"

endpoint Greet() -> (msg String):
    memory p = Person{name: "Alice", age: 30}
    msg = f"hello {p}"
    // msg == `hello {"name": "Alice", "age": 30}`
```

The trailing `}}}` in `__str__` is the var-close `}` for `{self.age}`
followed by the `}}` escape for the literal closing brace.

## String Iteration

```coco
// Iterate characters
memory cnt U64
for i, c in "ABBA":
    if c == "A":
        cnt++
// cnt = 2

// Empty string — loop doesn't execute
for i, c in String():
    throw "shouldn't be here"
```

## Bytes

### Literals and Construction

```coco
memory b = Bytes(0x004142)                    // from hex literal
memory b2 = Bytes("hello")                    // from string
memory b3 = Bytes()                           // empty bytes
```

### Operations

```coco
// Concatenation
memory combined = bytes1 + bytes2

// Length
memory l = len(b)

// Indexing (returns single byte as Bytes)
// Iteration
memory cnt U64
for i, c in Bytes(0xaabb) + Bytes(0xccdd):
    if c == Bytes(0xaa):
        cnt++
```

### Bytes-String Conversion

```coco
memory b = Bytes("Akash")
memory s = String(b)
memory b2 = Bytes(s)
```

### Bytes-Identifier Conversion

```coco
memory b = Bytes("Akash")
memory id = Identifier(Bytes(b))
memory b2 = Bytes(Identifier(Bytes(b)))
```

## Cryptographic Builtins

Access through the `Builtins` superglobal:

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `Builtins.Sha256(data: bytes)` | `Bytes` | `U256` | SHA-256 hash |
| `Builtins.Keccak(data: bytes)` | `Bytes` | `U256` | Keccak-256 hash |
| `Builtins.Blake2b(data: bytes)` | `Bytes` | `U256` | Blake2b hash |
| `Builtins.Sigverify(data, signature, pubkey)` | `Bytes` x3 | `Bool` | Verify signature |

### Example

```coco
endpoint TB() -> (b Bytes, l U64, bl U256):
    memory by = Bytes(0x004142)
    l = len(by)
    bl = Builtins.Blake2b(data: by)
    yield b by

endpoint pure VerifySignature(data, signature, pubkey Bytes) -> (valid Bool):
    valid = Builtins.Sigverify(data, signature: signature, pubkey: pubkey)
```

## POLO Serialization

| Function | Description |
|----------|-------------|
| `polorize(value)` | Serialize any value to `Bytes` |
| `depolorize(Type, bytes)` | Deserialize `Bytes` to specified type |

```coco
endpoint pure Serialize(name String) -> (data Bytes):
    data = polorize(name)

endpoint pure Deserialize(data Bytes) -> (name String):
    name = depolorize(String, data)
```

## String Escape Sequences

Coco supports these escape sequences inside string literals:

| Escape | Result |
|--------|--------|
| `\"` | Literal double quote |
| `\n` | Newline |
| `\t` | Tab |
| `\\` | Literal backslash |

```coco
memory s = f"Hi, \"
dude\", nice\t \\backslash"
// Result: Hi, "\ndude", nice\t \backslash
```

**Multi-line strings:** Strings can span multiple source lines. Indentation in continuation lines is included in the string value:

```coco
memory s = "My spl
it string"           // "My spl\nit string"

memory s2 = "My spl
    it string"       // "My spl\n    it string" (spaces included!)
```

## Methods on Primitive Types

Primitive types have built-in methods accessible via dot notation:

### String Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `s.Get(idx: N)` | `String` | Character at index N (same as `s[N]`) |
| `s.ToBytes()` | `Bytes` | Convert string to bytes |

```coco
memory s = "hello"
memory ch = s.Get(idx: 0)     // "h"
memory b = s.ToBytes()         // 0x68656c6c6f

// Also works through class fields:
memory b2 = person.name.ToBytes()
```

### Numeric Methods

| Method | Available On | Returns | Description |
|--------|-------------|---------|-------------|
| `.Abs()` | `I64` | `I64` | Absolute value |
| `.ToU64()` | `Bool`, `Bytes`, `String`, `I64`, `U256` | `U64` | Convert to U64 |
| `.ToI64()` | `Bool`, `Bytes`, `String`, `U64`, `U256` | `I64` | Convert to I64 |
| `.ToU256()` | `Bool`, `Bytes`, `String`, `U64`, `I64` | `U256` | Convert to U256 |
| `.ToBytes()` | `String`, `Identifier`, `U64`, `I64`, `U256` | `Bytes` | Convert to Bytes |

```coco
memory x I64 = -10
memory pos = x.Abs()           // 10

// Method form vs cast form (equivalent):
memory n = some_i64.ToU64()    // same as U64(some_i64)
memory b = some_string.ToBytes() // same as Bytes(some_string)
```

Both forms (method `.ToU64()` and cast `U64(value)`) are valid. The cast form is more common.

## Environment

Runtime context, always available:

| Method | Returns | Description |
|--------|---------|-------------|
| `Environment.Timestamp()` | `U64` | Current block timestamp |
| `Environment.EffortCapacity()` | `U64` | Total fuel available for this execution |
| `Environment.EffortAvailable()` | `U64` | Remaining fuel |
| `Environment.VolumeCapacity()` | `U64` | Total storage space available |
| `Environment.VolumeAvailable()` | `U64` | Remaining storage space |

```coco
memory ts = Environment.Timestamp()
memory fuel_left = Environment.EffortAvailable()
memory storage_left = Environment.VolumeAvailable()
```

## Invocation

Current invocation context:

| Method | Returns | Description |
|--------|---------|-------------|
| `Invocation.ID()` | `Identifier` | Unique ID of this invocation |
| `Invocation.Caller()` | `Identifier` | Immediate caller of this endpoint |

```coco
memory ixn_id = Invocation.ID()
memory caller = Invocation.Caller()
memory ixn_as_id = Identifier(Invocation)  // convert invocation to Identifier
```

### Sender vs Caller

This distinction matters for cross-logic calls via interfaces:

| | `Sender` | `Invocation.Caller()` |
|---|----------|----------------------|
| **Definition** | The actor who initiated the original interaction | The immediate caller of this endpoint |
| **In direct calls** | Same | Same |
| **In cross-logic calls** | Stays the **original** sender | Changes to the **calling logic** |

```coco
// Logic A calls Logic B via interface:
// Inside Logic B:
//   Sender         = original user who called Logic A
//   Invocation.Caller() = Logic A's identifier
```

## Other Built-in Functions

| Function | Description |
|----------|-------------|
| `len(x)` | Length of array, map, string, bytes, or class (field count by default) |
| `typeof(x)` | Type name as String (e.g., `"U64"`) |
| `append(arr, item)` | Add item to end of varray |
| `popend(arr)` | Remove and return last item |
| `merge(a, b)` | Combine two arrays or maps |
| `remove(map, key)` | Remove key from map |
| `make(Type)` | Create empty collection or default class instance |
| `make(Type, n)` | Create collection with n zero elements |
| `join(a, b)` | Concatenate strings, or merge two class instances (via `__join__`) |
| `range(n)` | Generate [0, 1, ..., n-1] |
| `range(count, start)` | Generate `count` elements starting at `start` |

### `len()` on Classes

Without `__len__`, `len(obj)` returns the number of fields:

```coco
class C:
    field a U64
    field b String

memory c = C{a: 1, b: "hi"}
memory l = len(c)              // 2 (number of fields)
```

With `__len__` override, it returns the custom value (see [04-classes-and-events.md](04-classes-and-events.md)).

### `make()` for Classes

`make(ClassName)` creates a default (zero-valued) instance:

```coco
memory p = make(Person)        // all fields zero-valued
// equivalent to: memory p Person
```
