---
"@x402/moi": minor
---

Add the MOI mechanism for the `exact` scheme. MOI uses the `upfront` payment flow: interactions
are signed whole by the submitting account, so the buyer settles a MAS0 transfer first and proves
it with a signed claim bound to one resource. The facilitator holds no keys and confirms the
transfer by reading it back off the chain.
