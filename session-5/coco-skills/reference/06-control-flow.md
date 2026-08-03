# 06 — Control Flow

## If / Else

Standard conditional branching. Conditions must evaluate to `Bool`.

```coco
if balance < amount:
    throw "Insufficient balance"

if x > 5:
    emit "big"
else:
    emit "small"

if number > 5000:
    return (out: "large")
else if number >= 2500:
    return (out: "medium")
else:
    return (out: "small")
```

### One-Liners

Single statements can be on the same line:

```coco
if x > 5: throw "Too much"
else: emit "OK"
```

### Boolean Expressions in Conditions

```coco
// Compound conditions
if a && b:
    emit "both true"

if s[2:4] == "cd" && x == len(s):
    emit "match"

// Negation
if !confirmed:
    throw "Not confirmed"

// Bool conversion for non-bool types
memory k String
if Bool(k):            // empty string = false
    throw "Error"
```

## Ternary Operator

Single-line conditional assignment. Must be wrapped in parentheses.

```coco
// Basic
memory status = ("adult" if age >= 18 else "minor")
memory capped = (v if v < 100 else 100)

// Nested ternary
memory p = (x if x > 6 else (77 if x < 6 else 99))

// With function calls
x, y = ((a, b) <- P1() if v < 10 else (a, b) <- P2())

// In endpoint
endpoint Basic(v U64) -> (out U64):
    out = (v if v < 10 else v * 10)
```

## Switch / Case

Match a value against multiple cases. Cases can be literals, multiple values, or boolean expressions.

### Basic Switch

```coco
switch x:
    case 0:
        s = "zero"
    case 1:
        s = "one"
    default:
        s = "other"
```

### Multiple Values Per Case

```coco
switch x:
    case 0:
        s = "zero"
    case 1, 2, 3:
        s = "not too big"
    default:
        s = "big"
```

### Expression Cases

```coco
switch x:
    case 0:
        s = "zero"
    case 1, 2, 3:
        s = "not too big"
    case x < 10:
        s = "less than 10"
    default:
        s = "a lot"
```

### Switch on Expression

```coco
switch x * 2:
    case 0:
        s = "zero"
    case 24:
        s = "twenty-four"
    case x > 10 && x < 20:
        s = "medium"
    default:
        s = "other"
```

### Switch with Function Calls in Cases

```coco
switch s:
    case len(s) == 3:
        x = 1
    default:
        x = 0
```

### Switch on Strings

```coco
switch x:
    case "0":
        s = "zero"
    case "1":
        s = "one"
    default:
        s = "other"
```

### Switch on Classes (requires `__eq__`)

```coco
class Person:
    field name String
    method __eq__(other Person) -> (is_equal Bool):
        is_equal = self.name == other.name

switch input:
    case Person{name: "tel"}:
        x = 2
    case Person{name: "mel"}:
        x = 3
    default:
        x = 1
```

### Missing Default

Default is optional. If no case matches and no default, nothing happens:

```coco
switch s:
    case len(s) == 3:
        x = 1
// x unchanged if len(s) != 3
```

## For Loops

Coco only supports iteration over **finite sequences** (arrays, varrays, strings, bytes). No `while` or infinite loops.

### Index and Value

```coco
for i, val in items:
    emit f"{i}: {val}"
```

### Value Only (ignore index)

```coco
for _, val in items:
    process(val)
```

### Index Only

```coco
for i in range(len(items)):
    items[i] += 1
```

### Range

```coco
// 0 to n-1
for i in range(5):
    sum += i           // 0 + 1 + 2 + 3 + 4 = 10

// Both index and value (same for range)
for i, val in range(5):
    // i == val for range
```

### Nested Loops

```coco
memory s U64
for i, t in range(n1):
    memory u U64
    for j, val in range(n2):
        s += i
        u = 6
    if u != 6:
        throw f"Expected u==6"
```

### Iterating Strings

```coco
memory cnt U64
for i, c in "ABBA":
    if c == "A":
        cnt++
// cnt = 2
```

### Iterating Bytes

```coco
for i, c in Bytes(0xaabb) + Bytes(0xccdd):
    if c == Bytes(0xaa) || c == Bytes(0xdd):
        cnt++
```

### Iterating State Arrays

```coco
observe psts <- Module.Logic.posts:
    for _, post in psts:
        memory mem_post = Post{
            subject: post.subject,
            msg: post.msg,
        }
        append(all_posts, mem_post)
```

### Empty Collection Guard

Iterating an empty collection is safe — the loop body never executes:

```coco
for i, c in String():
    throw "shouldn't be here"   // never reached

for i, c in Bytes():
    throw "shouldn't be here"   // never reached
```

## Break and Continue

### Break — Exit Loop

```coco
for i, val in items:
    if val == "stop":
        break                   // exits the innermost loop
```

### Continue — Skip Iteration

```coco
for i, val in items:
    if val == "skip":
        continue                // skip to next iteration
    process(val)
```

### Break with Yield

Set a return value then break out:

```coco
endpoint static Tst() -> (out U64):
    observe agents <- Module.Logic.agents:
        for i in range(len(ids)):
            count += 1
            if count >= limit:
                yield out count
                break
```

## Throw — Exceptions

Immediately stops execution and returns an error.

### Throw String

```coco
throw "Insufficient balance"
throw f"User {name} is not authorized"
throw f"Expected u==6"
```

### Throw Class (with `__except__`)

```coco
class UnderageError:
    field age U64
    method __except__() -> (err String):
        err = f"Underage: only {self.age} years"

memory person = UnderageError{age: 15}
throw person                    // throws "Underage: only 15 years"
```

### Revert

Similar to throw but with a revert flag:

```coco
revert "Transaction reverted"
```

### Common Patterns

```coco
// Guard check
if Sender != admin:
    throw "User is not super admin"

// Map key check
if !donors[donorID]?:
    throw "Donor not found"

// Balance check
if bal < amount:
    throw "Insufficient balance"

// Assert with format
if x != original:
    throw f"switch has changed original value"
```

## Pass — No Operation

Used for empty blocks that require a body:

```coco
endpoint DoNothing():
    pass

endpoint dynamic Init():
    pass

mutate bytes <- Module.Logic.bytes:
    pass
```

## Try / Catch / Finally

`try`, `catch`, and `finally` are **reserved keywords** for future use. Exception handling is not yet implemented.

## Error Types in Tests

Common error types you'll see in test output:

| Error Type | When It Occurs |
|------------|----------------|
| `builtin.AccessError` | Map key doesn't exist, index out of bounds |
| `builtin.ArithmeticError` | Integer overflow/underflow |
| `builtin.RuntimeError` | General runtime errors |
| `user` | From `throw "message"` |
