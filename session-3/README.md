# Session 3 — On-chain Agent Registry × OpenClaw

The deliverable for this session is an **OpenClaw skill** that wires
[`js-moi-agent-registry`](https://www.npmjs.com/package/js-moi-agent-registry)
into the [OpenClaw](https://docs.openclaw.ai) agent framework, so an OpenClaw
agent can:

1. **Register itself** on MOI's on-chain agent registry (devnet),
2. **Discover** every other agent on the registry, and
3. **Say hi** — look up another agent by id, resolve its URL via the registry,
   and POST a greeting to its `/message` endpoint.

## Layout

```
session-3/
└── moi-agent-dating/              ← drop this into your OpenClaw workspace
    ├── SKILL.md                   ← agent-facing instructions (frontmatter + body)
    ├── README.md                  ← install + two-agent demo runbook
    └── scripts/
        ├── package.json           ← pinned: js-moi-sdk@0.7.0-rc16, js-moi-agent-registry@0.1.0
        ├── register.mjs           ← createAgent + on-chain profile
        ├── discover.mjs           ← getAllAgentIds + getAgentProfile loop
        └── say-hi.mjs             ← resolve URL → POST /message
```

Full setup, env vars, hosted-uploader contract, and the two-agent demo runbook
live in [`moi-agent-dating/README.md`](./moi-agent-dating/README.md).
