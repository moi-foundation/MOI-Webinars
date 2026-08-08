# Publish checklist — Medium only

Paste-ready body: **`MEDIUM.md`** (frontmatter stripped, H1 removed, image
slots marked).

---

## The one thing to decide now, not later

Publishing on Medium first means **Medium becomes the canonical version** —
it's the only version that exists, so Google indexes it as the original.

If moi.technology publishes this post later, it arrives as the duplicate.
Medium has the authority, the index position, and the backlinks. The site
version loses to its own mirror.

Two ways to avoid that, both decided **before** you publish:

- **Accept it.** Medium is the home for this one. Fine for a session write-up,
  and Medium is well-crawled by AI engines — the citation work isn't wasted.
- **Plan the handoff.** When moi.technology goes live, set the canonical link
  on the Medium story (Story Settings → Advanced → customize canonical link)
  to point at the site version. Do it the same day the site version ships.

Not urgent today. Just don't discover it six months in.

---

## Steps

### 1. Story setup

- [ ] **Title:** How AI Agents Pay Each Other — A Working Demo on MOI
- [ ] **Subtitle:** Two AI agents transact on MOI with no human, no accounts,
      and no payment processor.
- [ ] Paste the body from `MEDIUM.md`

### 2. Images — none, by decision

Publishing text-only for now. `MEDIUM.md` has no image slots, and the chart's
numbers were folded into the prose so nothing dangles.

Two consequences, neither blocking:

- Medium picks the social-card image itself, which with no images means your
  avatar or nothing. Link previews on X and LinkedIn will be plain.
- Medium's feed favours stories with a visual, so reach will be lower than it
  would be with a cover.

Both assets stay in the repo, current and correct, if you want them later:

- `hero-two-agents.png` — needs the "Probability **Book** Desk" wording fixed
  and the slide chrome removed before it should be used
- `chart-payment-layer-loc.png` — clean, accurate, ready to drop in as-is

### 3. Check what survived the paste

Medium's editor mangles some markdown. Verify:

- [ ] **5 code blocks** render as code, not paragraphs (the 402 fields, the
      identity check, the terminal output, the two-signature snippet, and the
      transaction hash)
- [ ] The numbered walkthrough kept its numbering, including the indented
      sub-paragraphs under step 1
- [ ] The blockquote pull-quotes are still blockquotes
- [ ] Bold and italics survived, especially *where* / *whose*

### 4. Tags — pick 5, Medium's limit

The post has six in frontmatter. Suggested five, balancing reach against
precision:

`AI Agents` · `Agentic AI` · `Blockchain` · `Payments` · `Web3`

Keep `MOI`, `HTTP 402` and `on-chain identity` out — near-zero follower counts
on Medium, so they cost you a slot and return nothing.

### 5. Social

- [ ] Replace `CANONICAL_URL` in `social-pack.md` with the Medium URL
      (appears in the X thread, LinkedIn post and Reddit post)
- [ ] Decide the `$2.9 billion` question: all three posts still lead on the BEC
      figure that was cut from the blog. Not wrong, but the hook no longer
      matches what the post argues.

---

## Not applicable to Medium

- **schema.jsonld** — Medium strips custom JSON-LD. Keep the file for whenever
  the site version happens.
- **The client-side-rendering blocker** — that was a moi.technology problem.
  Medium serves real HTML and is crawled fine.

---

## Current state

| | |
|---|---|
| Words | 3,193 (~13.7 min) |
| AI citation readiness | 80/100 |
| Blog quality | 69/100 |
| External links | 27 unique, all resolving |
| Line counts | recounted, accurate as of this commit |

The 69 is depressed by two artifacts: "no JSON-LD" (not fixable on Medium, and
not a real defect there) and a readability penalty for being *too* easy to read
(Flesch 86.9 against a 60–70 target).
