# 05 — Collections

## Arrays

### Fixed-Length Arrays

Size is set at compile time and cannot change.

```coco
// Literal
memory arr = [3]U64{1, 2, 3}

// Zero-initialized
memory arr2 = make([3]U64)       // [0, 0, 0]

// Set elements
arr2[0] = 10
arr2[2] = 30
```

### Variable-Length Arrays (Varrays)

Dynamic arrays that grow and shrink.

```coco
// Empty
memory vrr []U64

// Literal
memory items = []String{"foo", "bar", "baz"}

// With make
memory sized = make([]U64, 2)    // [0, 0]

// Typed empty
memory posts []Post
```

### Array Operations

| Operation | Syntax | Description |
|-----------|--------|-------------|
| Index | `arr[i]` | Access element at index i |
| Slice | `arr[start:end]` | Sub-array from start to end (exclusive) |
| Length | `len(arr)` | Number of elements |
| Append | `append(arr, item)` | Add item to end |
| Pop | `popend(arr)` | Remove and return last item |
| Merge | `merge(a, b)` | Combine two arrays (returns new array) |
| Make | `make([]Type)` | Empty array |
| Make sized | `make([]Type, n)` | Array of n zero values |

### Append

```coco
memory a []U64
append(a, 1)              // a = [1]
append(a, 2)              // a = [2]

// In state — use disperse for complex types
mutate arr <- Module.Logic.arr:
    disperse append(arr, newItem)

// For simple scalar append in memory, no disperse needed
memory items []String
append(items, "hello")
```

### Popend

```coco
memory a = []U64{1, 2, 3}
memory last = popend(a)        // last = 3, a = [1, 2]

// In state — use sweep
mutate arr <- Module.Logic.arr:
    sweep popend(arr)

// Capture popped value with sweep
memory removed = sweep popend(arr)
```

### Merge

Combines two arrays. Does NOT modify the originals.

```coco
memory a = []U64{1, 2, 3}
memory b = []U64{4, 5}
memory c = merge(a, b)        // c = [1, 2, 3, 4, 5]
// a and b are unchanged
```

### Slicing

```coco
memory a = []U64{1, 2, 3, 4, 5, 6, 7}
memory sub = a[1:4]           // [2, 3, 4]
memory tail = a[1:3]          // [2, 3]
```

### Iterating Arrays

```coco
// Index and value
for i, val in items:
    emit f"{i}: {val}"

// Value only
for _, val in items:
    process(val)

// Index only
for i in range(len(items)):
    items[i] = items[i] + 1
```

### Arrays of Classes

```coco
// Verbose form — inner type spelled out each time
memory ops = []Operator{
    Operator{OperatorID: "xyz"},
    Operator{OperatorID: "abc"},
}

// Brace-elided shorthand — inner type inferred from the outer declaration
memory ops2 = []Operator{{OperatorID: "xyz"}, {OperatorID: "abc"}}

// Elided fields default to their zero value
memory ps = []Person{{age: 3}, {name: "C"}}  // [{"" 3}, {"C" 0}]

// Iterate and collect
memory ids []String
for _, op in ops:
    append(ids, op.OperatorID)
```

### Nested / Multi-Dimensional Arrays

Arrays can be nested to any depth, including fixed-size multi-dimensional arrays:

```coco
// 2D variable array
state logic:
    arr [][]U64

// Initialize
mutate a <- Module.Logic.arr:
    disperse a <- make([][]U64)

// Append inner array
mutate x <- Module.Logic.arr:
    disperse append(x, []U64{1, 2, 3})

// Fixed-size 2D array
memory grid = [2][3]U64{{1, 2, 3}, {4, 5, 6}}
memory val = grid[1][2]           // 6

// Variable 2D — inner type inferred (brace-elided)
memory rows = [][]U64{{1}, {2, 3}}

// Triply-nested — elision propagates through every level
memory tri = [][][]U64{{{1, 2}}, {{3, 4}, {5}}}
```

## Maps

### Declaration and Initialization

```coco
// Empty map (typed)
memory m Map[U64]String

// With make
memory m2 = make(Map[String]U64)

// Literal
memory m3 = Map[String]U64{"no": 0, "yes": 1}

// Trailing comma allowed
memory digits = Map[String]U64{
    "0": 0,
    "1": 1,
    "9": 9,
}
```

### Map Operations

| Operation | Syntax | Description |
|-----------|--------|-------------|
| Get | `m[key]` | Get value (throws if key missing) |
| Set | `m[key] = value` | Set or overwrite value |
| Has key | `m[key]?` | Check if key exists → `Bool` |
| Remove | `remove(m, key)` | Delete key-value pair |
| Length | `len(m)` | Number of entries |

### Setting and Getting

```coco
memory m Map[U64]String
m[0] = "No"
m[1] = "Yes"
memory val = m[0]              // "No"
```

### Key Existence Check (`?` operator)

```coco
memory exists = m[1]?          // true
memory missing = m[99]?        // false

// Use in conditions
if m[key]?:
    memory val = m[key]
else:
    throw "Key not found"

// In a class method
class Person:
    field friends Map[String]U64
    method HasFriend(friend String) -> (has Bool):
        has = self.friends[friend]?
```

### Remove

```coco
memory m = Map[U64]U64{0: 8, 1: 9, 2: 10}
remove(m, 1)                    // m = {0: 8, 2: 10}

// In state — use sweep
mutate operators <- Module.Logic.operators:
    sweep remove(operators, key)
    sweep(operators)
```

### Map with Class Values

```coco
// Verbose form
memory m = Map[String]Person{
    "Barfi!": Person{name: "Barfi"},
}

// Brace-elided shorthand — value type inferred from the map declaration
memory m2 = Map[String]Person{"Barfi!": {name: "Barfi"}}

// Works with array values too
memory m3 = Map[String][]U64{"a": {1, 2}, "b": {3}}

// Access class fields through map
memory name = m["Barfi!"].name

// Append to array inside map
memory m4 Map[String][]String
m4["abc"] = make([]String)
append(m4["abc"], "item")
```

### Nested Maps

```coco
// Declaration
memory m Map[I64]Map[String]I64

// Literal
m = Map[I64]Map[String]I64{
    -2: Map[String]I64{"no": 0, "yes": 1},
    1: Map[String]I64{"maybe": 2},
}

// Access nested
memory val = m[-2]["no"]       // 0

// In state
state logic:
    votes Map[Identifier]Map[U64]U64

mutate votes <- Module.Logic.votes:
    votes[user][id] = 1
```

### Nested Map with Generate

```coco
mutate votes <- Module.Logic.votes:
    generate memory:
        old = votes[Identifier(Sender)][id]
    generate votes[Identifier(Sender)][id]++
```

## Range

Generate a sequence of numbers for iteration:

```coco
// range(n) generates [0, 1, 2, ..., n-1]
for i in range(5):
    sum += i                   // 0+1+2+3+4 = 10

// range(count, start) generates count elements starting at start
memory k = range(2, 5)        // [5, 6]         (2 elements from 5)
memory p = range(5, 2)        // [2, 3, 4, 5, 6] (5 elements from 2)
```

## Make

Create new empty or zero-filled collections:

```coco
// Empty arrays
make([]String)                 // empty varray
make([]U64, 5)                 // [0, 0, 0, 0, 0]
make([3]U64)                   // [0, 0, 0] (fixed)

// Empty maps
make(Map[String]U64)           // empty map
make(Map[Identifier]String)    // empty map
```

## Collections in State

When working with collections in state, remember:

1. **Use `disperse` to write** complex types (maps, arrays, classes)
2. **Use `gather` to read** full complex objects
3. **Use `sweep`** when removing elements to clean storage
4. **Scalar access** inside observe/mutate blocks works without gather/disperse

```coco
// Correct: disperse for writing a map
mutate balances <- Module.Logic.balances:
    disperse balances <- localMap

// Correct: scalar access inside block
mutate balances <- Module.Logic.balances:
    balances[addr] = 100       // scalar write, no disperse needed

// Correct: gather to read full class
observe operators <- Module.Logic.operators:
    memory op Operator
    gather op <- operators[0]

// Correct: scalar read inside block
observe operators <- Module.Logic.operators:
    memory id = operators[0].Identifier  // no gather needed
```
