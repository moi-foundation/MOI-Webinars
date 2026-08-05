# Session 7 deck

`MOI_Builders_S7.pptx` — 8 slides, speaker notes on every one.
Regenerate with `node build-pptx.cjs` (needs `npm install pptxgenjs` in this folder).

The deck deliberately does **not** carry the content — the live demo and the code walkthrough do.
These slides frame the session, cue the two live segments, and land the closing argument. What to
say is in [TRANSCRIPT.md](../TRANSCRIPT.md); the notes on each slide are lifted from it.

## Design

Palette, type and layout taken from `MOI_Builders_S5_2.pptx`, read out of the file:

| | |
| --- | --- |
| fonts | **Inter** (headline/body) · **JetBrains Mono** (labels, code) |
| backgrounds | `#0E1116` dark · `#FFFFFF` light, alternating |
| accent | `#2D2BB6` on light · `#8B8AF0` on dark |
| surfaces | `#EEF0FB` lavender · `#F4F4F8` grey |
| borders | `#C9CBF0` · `#E4E5EC` · `#2A2E37` (dark) |
| signals | `#D6336C` negative · `#3CCB8E` positive |

Dark slides: title (1), the identity check (9), the close (12). Light slides carry the content.

**Install Inter and JetBrains Mono** on the presenting machine, or PowerPoint substitutes.

`index.html` is the earlier light-themed version, kept for reference — it does **not** match the
current pptx.
