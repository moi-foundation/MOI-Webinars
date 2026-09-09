# Game day — Friday 4 September, 4pm IST

## Tonight (Thursday)

1. **Fix the Luma title.** It says "MOI Builders VII". Should be VIII.
2. **Post the last call.** Drafts are in `social/`. Nothing is scheduled.
3. **Send Rahul the deck and the blog.** He asked for both on the call.
4. **Read `SCRIPT.md` once out loud, end to end.** Time it. It should land
   around 24 minutes without the demo.

## T-60 minutes

5. **Run the demo once, for real.**
   ```
   npm run preflight && npm run demo
   ```
   Preflight should say 4/4 and "owner has 0 storage policies". If it says 1
   policy, the last run didn't clean up. Run the demo anyway, it deletes a
   leftover policy before beat 1.

6. **Check fuel.** A full run costs 506 KMOI, agent 306 and owner 200. The agent
   holds about 18,885, so roughly 60 runs. You will not run out. If the agent
   somehow is low: `npm run setup:fuel`.

7. **Open the deck** and press `P` for the presenter window. Share the deck
   window in Meet, keep the presenter window on your own screen.

8. **Have the recording open in a tab.** `recording/demo.mp4`. You want it one
   click away, not one search away.

## T-10 minutes

9. **Terminal ready.** Big font, in `session-8-policies`, command typed but not
   entered. Clear the scrollback so beat 1 starts at the top of a clean screen.
10. **Close everything else.** Notifications off.
11. **Run the demo one final time** so the counter is warm and you know the node
    is responding. It's 506 KMOI, it costs you nothing that matters.

## Running order

| | Slides | Roughly |
|---|---|---|
| Why any of this exists | 1 to 5 | 8 min |
| The problem it creates | 6 to 8 | 5 min |
| The code | 9 to 12 | 6 min |
| Demo | 13 | 4 min |
| Receipt, revocation, scope | 14 to 17 | 4 min |
| Close and questions | 18 | rest |

## If something breaks

**Demo fails or the node hangs.** Don't debug live. Read the fallback line in
`SCRIPT.md`, play `recording/demo.mp4`, carry on from slide 14. Every hash in
the recording is on chain, so nothing about the argument depends on the live
run.

**Node is slow.** The demo pauses between beats by design. If it's crawling,
`DEMO_PAUSE_MS=0 npm run demo`.

**Someone asks about spend limits.** Answer honestly: asset policies are
reserved, not live. Slide 17 already says this, so don't get talked past it.

**Someone asks whether the agent can bypass it.** Slide 12. The check is in the
runtime, not in the program. That's the whole argument, so take the time.

## Known state, so nothing surprises you

- The bounty is **not live**. It ships disabled behind a flag and needs a
  migration, `MOI_RPC_URL` in the deploy environment, and the flag flipped. If
  you announce it on the call, announce it as coming, not as open.
- The Points repo moved to `sarvalabs/Points-Program`. The PR is
  `sarvalabs/Points-Program#1` and it isn't merged.
- Nothing about access policies exists on docs.moi.technology. PR 120 hasn't
  merged, so don't point people at docs.
- The repo link on slide 18 is `moi-foundation/MOI-Webinars`, which is live.

## After

- Push the recording and the deck PDF.
- Post the blog.
- Open the bounty once the deploy steps are done.
