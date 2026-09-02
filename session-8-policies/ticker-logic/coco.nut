[coco]
version = "0.8.0"

[module]
name = "Ticker"
version = "0.0.1"
license = []
repository = ""
authors = []

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "JSON"
output = "ticker"

[target.pisa]
format = "ASM"
version = "0.7.0"

[lab.render]
big_int_as_hex = false
bytes_as_hex = false

[lab.config.default]
url = "http://127.0.0.1:6060"
env = "main"

[lab.scripts]
demo = [
    "compile Ticker",
    "register alice as 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "register bob as 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "invoke Ticker.TickMy() as bob",
    "invoke Ticker.CounterOf(participant: bob) as bob",
    "invoke Ticker.TickAny(participant: bob) as alice",
]
