# 08 — Modules and Imports

## Module Structure

A module is a collection of all `.coco` files in a folder that share the same `coco <name>` declaration.

```
my_project/
├── coco.nut            # Project configuration (TOML)
├── main.coco           # coco MyProject
├── helpers.coco        # coco MyProject (same name!)
└── math/               # Package folder
    ├── coco.nut        # Package configuration
    ├── complex.coco    # coco package math
    └── point.coco      # coco package math
```

**Rule:** All `.coco` files in the same folder MUST have the same module/package name. Compilation fails if they differ.

## Module Declaration

```coco
// Regular module (compiles to a deployable logic)
coco MyModule

// Asset module
coco asset MyToken

// Package (reusable library, not independently deployable)
coco package math
```

## Packages

Packages are reusable code libraries that modules can import.

### Creating a Package

1. Create a subfolder with `.coco` files
2. Use `coco package <name>` declaration
3. Mark public items with `pub`

```coco
// math/complex.coco
coco package math

imports: "./iopkg"

pub class Complex:
    field re U64
    field im U64
    method Abs() -> (abs U64):
        abs = (sqrt) <- Sqrt(n: self.re * self.re + self.im * self.im)

pub function four() -> (four U64):
    four = iopkg::NUM4
```

```coco
// math/point.coco
coco package math

pub class Point:
    field coords [3]I64

    method dist(other Point) -> (dist U64):
        memory dx = self.coords[0] - other.coords[0]
        memory dy = self.coords[1] - other.coords[1]
        memory dz = self.coords[2] - other.coords[2]
        dist = (sqrt) <- Sqrt(n: U64(dx*dx + dy*dy + dz*dz))
```

### `pub` Visibility

By default, everything in a package is **private**. Use `pub` to export:

```coco
pub class Complex:        // visible to importers
    field re U64          // fields are always visible if class is pub

pub function four():      // visible to importers

function internal():      // NOT visible to importers (private)
class Hidden:             // NOT visible to importers (private)
```

`pub` works on:
- `pub class` — export a class
- `pub function` — export a function
- `pub method` — export a method (on a pub class)
- `pub const` — export a constant

## Imports

### Basic Import

```coco
coco main

imports:
    "./math"              // Import package from relative path
```

### Aliased Import

```coco
imports:
    "./math"                    // access as math::
    io2 "./math/iopkg"          // access as io2::
    mypkg "../tstpkg"           // access as mypkg::
    "decimal"                   // standard package (from --pkg path)
```

### Using Imported Items

Use the double-colon `::` syntax:

```coco
// Access class from package
memory z = math::Complex{re: 4, im: 5}

// Access constant from aliased package
memory x = io2::NUM4

// Call function from package
memory result = (sqrt) <- math::Sqrt(n: 16)

// Use as parameter type
endpoint Len(point math::Point) -> (l U64):
    l = (dist) <- point.dist(other: math::Point{coords: [3]I64{0, 0, 0}})

// Call from aliased package
memory y_arr = (y) <- io2::Y()
memory max = mypkg::MAX
```

### Packages Can Import Other Packages

```coco
// math/complex.coco
coco package math
imports: "./iopkg"           // package imports another package

pub function four() -> (four U64):
    four = iopkg::NUM4       // uses imported package
```

## coco.nut Configuration

### For Modules

Generated with `coco nut init <module_name>`:

```toml
[coco]
version = "0.7.0"

[module]
name = "MyModule"
version = "0.0.1"
license = []
repository = ""
authors = []

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "YAML"          # Output format: YAML, JSON, or POLO
output = "mymodule"      # Output filename (without extension)

[target.pisa]
format = "BIN"           # Code format: BIN, HEX, or ASM
version = "0.5.0"        # PISA version

[lab.render]
big_int_as_hex = true    # Display U256 as hex in Cocolab
bytes_as_hex = false

[lab.config.default]
env = "main"

[lab.scripts]
test-toggle = ["engines", "users", "logics"]

[scripts]
test-script = "coco compile .; pwd"
```

### For Packages

Generated with `coco nut init-package <package_name>`:

```toml
[coco]
version = "0.7.0"

[package]
name = "math"
version = "0.0.1"
license = []
repository = ""
authors = []

[package.targets]
supported = []
unsupported = []
```

## CLI Commands

```bash
# Initialize a new module
coco nut init MyModule

# Initialize a new package
coco nut init-package math

# Compile the current directory
coco compile .

# Compile with flags
coco compile . --debug --optimize 2

# Run a coco.nut script
coco nut run test-script
```

## Module as Superglobal

The module name acts as a superglobal for accessing state:

```coco
coco NumberStore

state logic:
    value U64

endpoint deploy Init(value U64):
    mutate value -> NumberStore.Logic.value    // module name = state prefix

endpoint LogicId() -> (id Identifier):
    yield id Identifier(NumberStore)           // module name as Identifier
```
