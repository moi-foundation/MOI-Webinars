[coco]
version = "0.7.0"

[module]
name = "Flipper"
version = "0.0.1"
license = []
repository = ""
authors = []

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "JSON"
output = "flipper"

[target.pisa]
format = "BIN"
version = "0.5.0"

[lab.render]
big_int_as_hex = true
bytes_as_hex = false

[lab.config.default]
env = "main"
