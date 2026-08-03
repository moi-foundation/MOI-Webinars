# 07 — Interfaces

Interfaces let your logic interact with **other deployed logics** — read their state and call their endpoints.

## Definition

An interface has four optional sections:

```coco
interface TokenInterface:
    state logic:
        total_supply U256
        owner Identifier

    state actor:
        balance U256

    endpoint:
        dynamic Transfer(to Identifier, amount U256)
        static GetBalance(account Identifier) -> (balance U256)
        Guru() -> (guru Person)

    asset:
        Mint(amount U256)
```

| Section | Purpose |
|---------|---------|
| `state logic` | Fields on the external logic's logic state |
| `state actor` | Fields on the external logic's actor state |
| `endpoint` | Endpoints you can call |
| `asset` | Asset endpoints you can call (see [08-native-assets.md](08-native-assets.md)) |

**Only define what you need** — you don't have to mirror the entire external logic.

## Binding to a Logic

Instantiate an interface with the deployed logic's `Identifier`:

```coco
memory token = TokenInterface(token_id)
```

## Reading External State

Use `observe` with the interface variable:

```coco
memory iface = answer(answerLogicId)

// Read external logic state
observe guru <- iface.Logic.guru

// Read external sender's actor state
observe actorAnswer <- iface.Sender.ActorAnswer

// Read specific actor's state
observe val <- iface.Actor(question).ActorAnswer
```

## Reading Complex External State

Use `gather` just like with local state:

```coco
observe gg <- iface.Logic.guru:
    memory fn []String
    memory fr Map[String]Bool
    gather fn <- gg.friend_names
    for _, name in fn:
        fr[name] = gg.friends[name]
    guru = Person{
        name: gg.name,
        age: gg.age,
        friend_names: fn,
        friends: fr,
    }
```

## Calling External Endpoints

```coco
memory iface = answer(answerLogicId)

// Call endpoint (no return)
iface.NewGuru(new_guru: person)

// Call endpoint with return capture
endpointGuru = (guru) <- iface.Guru()
endpointActorAnswer = (actor_answer) <- iface.GetActorAnswer(actorId: Sender)

// Call dynamic endpoint
iface.SetActorAnswer(actorId: Sender, new_answer: value)
```

## Specifying Sender / Participant

By default, cross-logic calls are made as the current `Sender`. Pass a second argument to bind a different participant:

```coco
// Default: calls as Sender
memory token = TokenInterface(token_id)
token.Transfer(to: recipient, amount: 100)

// Specific participant
memory token = TokenInterface(token_id, participant_id)
token.Transfer(to: recipient, amount: 100)  // called as participant_id
```

## Complete Interface Example

**External logic (`answer.coco`):**
```coco
coco answer

class Person:
    field name String
    field age U64
    field friend_names []String
    field friends Map[String]Bool

state logic:
    guru Person

state actor:
    ActorAnswer U64

endpoint deploy Init() -> (g Person):
    mutate guru <- answer.Logic.guru:
        disperse guru <- Person{
            name: "AK",
            age: 60,
            friend_names: []String{"Rahul", "Robert"},
            friends: Map[String]Bool{"Rahul": true, "Robert": false},
        }

endpoint dynamic SetActorAnswer(actorId Identifier, new_answer U64) -> (set_answer U64):
    mutate new_answer -> answer.Actor(actorId).ActorAnswer
    observe set_answer <- answer.Actor(actorId).ActorAnswer

endpoint Guru() -> (guru Person):
    observe gg <- answer.Logic.guru:
        // ... gather and return
```

**Your logic (`question.coco`):**
```coco
coco question

interface answer:
    state logic:
        guru Person
    state actor:
        ActorAnswer U64
    endpoint:
        dynamic NewGuru(new_guru Person)
        Guru() -> (guru Person)
        GetActorAnswer(actorId Identifier) -> (actor_answer U64)
        dynamic SetActorAnswer(actorId Identifier, new_answer U64) -> (set_answer U64)

endpoint dynamic SetActorAnswer(answerLogicId Identifier, new_answer U64) -> (set_answer U64):
    memory answer_iface = answer(answerLogicId)
    set_answer = answer_iface.SetActorAnswer(actorId: Sender, new_answer)

endpoint dynamic GetAnswers(answerLogicId Identifier) -> (guru Person, actorAnswer U64):
    memory answer_iface = answer(answerLogicId)
    observe guru <- answer_iface.Logic.guru
    observe actorAnswer <- answer_iface.Sender.ActorAnswer
```

## Endpoint Qualifiers Propagate Across Interface Calls

An interface endpoint or `asset` operation carries its own state qualifier
(`dynamic` / `static` / `pure`), and a cross-logic call counts as state access in
the **calling** endpoint. The caller's qualifier must be at least as strong as the
strongest interface call it makes:

| Strongest interface call in the body | Required caller qualifier |
|--------------------------------------|---------------------------|
| `dynamic` endpoint, or any `asset:` operation | `dynamic` |
| `static` endpoint (and no `mutate` of your own) | `static` |
| `pure` endpoint only (and no other state access) | `pure` |

An interface endpoint declared **without** a qualifier is treated as `static`
(it may read external state). The qualifier you must match is the one written in
the `interface` block.

```coco
interface Token:
    state logic:
        supply U256
    endpoint:
        dynamic Transfer(to Identifier, amount U256)
        static GetSupply() -> (supply U256)
    asset:
        Mint(amount U256)

// Calls a dynamic endpoint -> the caller must be dynamic
endpoint dynamic Send(token Identifier, to Identifier, amount U256):
    memory t = Token(token)
    t.Transfer(to: to, amount: amount)

// Only reads through a static endpoint -> the caller must be static
endpoint static Supply(token Identifier) -> (supply U256):
    memory t = Token(token)
    supply = (supply) <- t.GetSupply()

// Calls an asset operation -> the caller must be dynamic
endpoint dynamic MintMore(token Identifier, amount U256):
    memory t = Token(token)
    t.Mint(amount: amount)
```

This combines with local state access: an endpoint that only `observe`s its own
state but also calls a `dynamic` interface endpoint must be `dynamic`, because
`dynamic` outranks the `static` implied by the local `observe`.

## Key Rules

1. **Interface binding is runtime** — the same interface can point to different logics
2. **Second argument is participant** — `Interface(logicId, participantId)` for cross-logic calls as a specific actor
3. **State reading is direct** — use `observe` on `iface.Logic.*` or `iface.Sender.*`
4. **State mutation requires endpoints** — you can only read external state directly; to write, call an endpoint
5. **Interfaces also access asset logics** — use `asset:` section to call native asset operations (see [08-native-assets.md](08-native-assets.md))
6. **Calls propagate qualifiers** — calling a `dynamic` interface endpoint (or any `asset` operation) makes the calling endpoint `dynamic`; calling only `static` endpoints makes it `static` (see *Endpoint Qualifiers Propagate Across Interface Calls* above)
