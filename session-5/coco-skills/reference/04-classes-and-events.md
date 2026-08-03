# 04 — Classes and Events

## Classes

Classes group fields and methods into reusable structures.

### Definition

```coco
class Person:
    field name String
    field age U64
    field hobbies []String
    field friends Map[String]String
```

### Constructing Instances

Use struct literal syntax with `ClassName{field: value}`:

```coco
memory p = Person{
    name: "Alice",
    age: 32,
    hobbies: []String{"swimming", "dancing"},
    friends: Map[String]String{"Bob": "FWB"},
}

// Single line
memory p2 = Person{name: "Bob", age: 28, hobbies: []String{"hiking"}, friends: make(Map[String]String)}
```

### Accessing Fields

```coco
memory name = p.name
memory first_hobby = p.hobbies[0]
memory bob_rel = p.friends["Bob"]
```

### Setting Fields

```coco
p.age = 33
p.hobbies[0] = "running"
```

### Empty Classes

A class can be declared with no body (useful as a tag or placeholder):

```coco
class Empty:
    pass
```

### Default Construction

Create with zero values:

```coco
memory p Person                    // all fields zero-valued
memory p2 = Person                 // same
p2.name = "Alice"                  // set fields individually

// Also with make():
memory p3 = make(Person)           // equivalent to above
```

### Partial (Elided) Field Literals

Any field omitted from a class literal takes its type's zero value:

```coco
memory a = Person{age: 3}          // name: "",  age: 3
memory b = Person{name: "C"}       // name: "C", age: 0
memory c = Person{}                // all fields zero (same as `memory c Person`)
```

## Methods

### Regular Methods (read-only on self)

```coco
class Person:
    field name String
    field age U64

    method GetInfo() -> (info String):
        info = f"{self.name} is {self.age}"

    method IsAdult() -> (adult Bool):
        adult = self.age >= 18
```

### Mutating Methods

Use `mutate` keyword for methods that modify `self`:

```coco
class Counter:
    field count U64

    method mutate Increment():
        self.count += 1

    method mutate ReadName():
        self.name = "Manish"
```

### Calling Methods

```coco
memory p = Person{name: "Alice", age: 32}

// Direct call (no return)
p.Birthday()

// Capture return value
memory info = (info) <- p.GetInfo()

// Or for methods with self-named returns
memory name = (name) <- p.Name()
```

### Methods Calling Functions

Methods can call module-level functions:

```coco
class Person:
    field name String
    method Name() -> (name String):
        name = (enhanced) <- enhance(n: self.name)

function enhance(n String) -> (enhanced String):
    enhanced = f"The most excellent {n}"
```

## Special Methods

Override these to customize class behavior:

| Method | Purpose | Signature |
|--------|---------|-----------|
| `__eq__` | Equality (`==`, `!=`) | `(other T) -> (is_equal Bool)` |
| `__lt__` | Less than | `(other T) -> (Bool)` |
| `__gt__` | Greater than | `(other T) -> (Bool)` |
| `__bool__` | Bool conversion | `() -> (result Bool)` |
| `__str__` | String conversion | `() -> (String)` |
| `__len__` | `len()` override | `() -> (U64)` |
| `__id__` | Identifier conversion | `() -> (Identifier)` |
| `__join__` | Merge two instances | `(other T) -> (joined T)` |
| `__event__` | Convert to event | `() -> (ev EventType)` |
| `__except__` | Custom error message | `() -> (err String)` |

### `__eq__` Example

```coco
class Person:
    field name String

    method __eq__(other Person) -> (is_equal Bool):
        is_equal = self.name == other.name

// Now works in switch and comparisons:
switch input:
    case Person{name: "tel"}:
        x = 2
    case Person{name: "mel"}:
        x = 3
    default:
        x = 1
```

### `__join__` Example

```coco
class Person:
    field name String
    field age U64
    field hobbies []String
    field friends Map[String]String

    method __join__(other Person) -> (joined Person):
        joined = Person{
            name: f"{self.name}+{other.name}",
            age: (max) <- max(a: self.age, b: other.age),
            hobbies: merge(self.hobbies, other.hobbies),
            friends: self.friends,
        }

// Usage with join() builtin
memory joined = join(p1, p2)
```

### `__event__` Example

```coco
class Registration:
    field name String
    field counter U64

    method __event__() -> (ev RegistrationEvent):
        ev = RegistrationEvent{ename: self.name}

event RegistrationEvent:
    topic ename String

// Then emit the class directly:
memory reg = Registration{name: "Alice", counter: 1}
emit reg -> Sender  // Calls __event__ automatically
```

### `__except__` Example

```coco
class Person:
    field age U64

    method __except__() -> (err String):
        err = f"Underage: only {self.age} years"

// Usage:
if person.age < 18:
    throw person  // Calls __except__, throws "Underage: only 15 years"
```

## Nested Classes

Classes can contain other classes as fields:

```coco
class VerifyProof:
    field Kind String
    field Proof U64

class Operator:
    field Identifier String
    field Verification VerifyProof
    field Guardians []String

// Construction with nested class
memory op = Operator{
    Identifier: "myID",
    Verification: VerifyProof{Kind: "strong", Proof: 66051},
    Guardians: make([]String, 0),
}

// Access nested fields
memory kind = op.Verification.Kind
```

## Classes in Collections

```coco
// Array of classes — verbose form
memory ops = []Operator{
    Operator{OperatorID: "xyz"},
    Operator{OperatorID: "abc"},
}

// Array of classes — brace-elided shorthand (inner type inferred)
memory ops2 = []Operator{{OperatorID: "xyz"}, {OperatorID: "abc"}}

// Map of classes — verbose
memory m = Map[String]Person{"Alice": Person{name: "Alice"}}

// Map of classes — brace-elided shorthand
memory m2 = Map[String]Person{"Alice": {name: "Alice"}}

// Iterate
for _, op in ops:
    emit op.OperatorID
```

Shorthand entries may also elide fields — they default to zero:

```coco
memory ps = []Person{{age: 3}, {name: "C"}}  // [{"" 3}, {"C" 0}]
```

## Events

Events are log entries emitted during execution for tracking actions.

### Definition

```coco
event TransferEvent:
    topic from Identifier     // Indexed, searchable (max 4 topics)
    topic to Identifier
    field amount U64          // Non-indexed data (max 256 fields)
    field timestamp U64
```

**Limits:** Up to 4 topics, up to 256 fields. Only primitive types allowed.

### Emitting Events

```coco
// Emit to logic context (default)
emit TransferEvent{
    from: sender_id,
    to: recipient_id,
    amount: 100,
    timestamp: Environment.Timestamp(),
}

// Emit to actor context
emit TransferEvent{...} -> Sender
emit TransferEvent{...} -> recipient_id
```

### Emit Strings (Quick Logging)

```coco
emit "Simple log message"
emit f"Transferred {amount} tokens"
emit f"Data verified"
```

String emits produce a `builtin.Log` event with the string as the log message. These appear in event queries and can be grepped in lab test output.

### Explicit Dunder Calls

Special methods can also be called explicitly:

```coco
memory eq = (is_equal) <- p1.__eq__(other: p2)
memory s = (result) <- obj.__str__()
memory b = (result) <- obj.__bool__()
```

### Class with `__event__`

Classes implementing `__event__` can be emitted directly:

```coco
memory p = Person{name: "Alice", age: 32}
emit p           // Calls p.__event__(), emits the returned event
emit p -> Sender // Emit to sender's context
```

## Complete Example

```coco
coco UserRegistry

class UserDetails:
    field name     String
    field phone    String
    field location String

event UserRegistered:
    topic user Identifier
    field name String

state actor:
    details UserDetails
    registered Bool

endpoint enlist Register(name, phone, location String):
    memory user = UserDetails{name: name, phone: phone, location: location}
    mutate details <- UserRegistry.Sender.details:
        disperse details <- user
    mutate true -> UserRegistry.Sender.registered
    emit UserRegistered{user: Sender, name: name}

endpoint static GetDetails() -> (details UserDetails):
    observe d <- UserRegistry.Sender.details:
        gather details <- d
```
