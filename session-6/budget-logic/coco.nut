[coco]
version = "0.8.0"

[module]
name = "AgentBudget"
version = "0.0.1"
license = []
repository = ""
authors = []

[target]
os = "MOI"
arch = "PISA"

[target.moi]
format = "JSON"
output = "agentbudget"

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
happy = [
    "compile AgentBudget",
    "register alice as 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "register bob as 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "invoke AgentBudget.SetBudget(amount: 500) as alice",
    "invoke AgentBudget.RecordSpend(amount: 100, memo: \"scrape\") as alice",
    "invoke AgentBudget.RecordSpend(amount: 350, memo: \"api call\") as alice",
    "invoke AgentBudget.GetBudget() as alice",
    "invoke AgentBudget.SetBudget(amount: 300) as bob",
    "invoke AgentBudget.GetBudget() as bob",
]
overspend = [
    "compile AgentBudget",
    "register alice as 0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "invoke AgentBudget.SetBudget(amount: 500) as alice",
    "invoke AgentBudget.RecordSpend(amount: 400, memo: \"ok\") as alice",
    "invoke AgentBudget.RecordSpend(amount: 200, memo: \"over\") as alice",
]
