# Community Call #14 deck

`index.html` — 13 slides (with the guest speaker); `index-no-guest.html` — the same deck without slide 12 in the MOI Builders deck framework, the same one session 8 and the
intro session use: fixed 1920×1080 stage, Poppins, MOI brand tokens, chips, cards, stats,
the comparison table, the planetoid watermark and staggered reveals.

- Open `index.html` in Chrome. Arrow keys, space, or click to move; dots at the bottom jump.
- **Press `P` for the presenter window.** It holds the talk script per slide, the next-slide
  title and a clock, and it drives the deck. In Meet, share the deck window and keep the
  presenter window on your own screen.
- `MOI_Community_Call_14.pdf` and `MOI_Community_Call_14_no_guest.pdf` are the slides-only exports (no script). Regenerate after any edit, running the command once per HTML file:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf="$PWD/MOI_Community_Call_14.pdf" "file://$PWD/index.html"
```

| | |
| --- | --- |
| flow | title → September release → upgrading → DevRel → AI visibility → by engine → the questions → content plan → community → Futuremode → what is next → guest speaker → close |
| source | community call #14 draft deck plus the Scribble AI-visibility report and community numbers (24 Sept); figures unchanged |
| photos | slide 10 reads `assets/futuremode-1.png` and `-2.png` (both in place); slide 12 reads `assets/mohit.webp` and `assets/krexa-logo.webp` (both in place). Drop the files in and they appear; until then the frames show the filename. |
| versions | edit `index.html`, then re-cut `index-no-guest.html` from it by deleting the guest slide and renumbering, so the two never drift |
| script | lives in the `NOTES` array at the bottom of `index.html`, one entry per slide |
