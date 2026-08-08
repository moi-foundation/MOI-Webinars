# Publish checklist — moi.technology canonical, Medium mirror

Order matters. Do these in sequence.

---

## 0. Before anything: the rendering blocker

The SEO audit found moi.technology serves a **652-byte shell on every route** —
100% client-side rendered, no server HTML.

Googlebot renders JavaScript and will probably cope. **Perplexity, ChatGPT and
most other AI crawlers do not.** They fetch the HTML and read what's there.

If the blog page renders client-side, they'll see an empty shell, and every
point of the 80/100 citation-readiness score is theoretical. The schema won't
be read either — it has to be in the served HTML, not injected after hydration.

**So: confirm the blog route is server-rendered or pre-rendered before
publishing.** Fetch it with `curl` and look for the article text. If the body
comes back empty, fix that first — nothing else on this list matters until it's
done.

```bash
curl -s https://moi.technology/blog/<slug> | grep -c "agentic payments"
```

Zero means the crawlers see nothing.

---

## 1. Publish on moi.technology FIRST

Canonical goes live before the mirror. If Medium indexes first, it outranks the
original and the canonical fight is already lost.

- [ ] Page is server-rendered (see step 0)
- [ ] Slug: `how-ai-agents-pay-each-other-moi`
- [ ] Upload both images, replace the relative paths in the post:
      - `./blog-assets/hero-two-agents.png`
      - `./blog-assets/chart-payment-layer-loc.svg` (or the `.png` — both are current)
- [ ] Self-referencing `<link rel="canonical">` on the page
- [ ] Open Graph + Twitter Card tags (the audit found none site-wide)

## 2. Schema — moi.technology only

Medium strips custom JSON-LD, so this only applies here.

- [ ] Replace `CANONICAL_URL` in `schema.jsonld` with the live URL
- [ ] Paste into the page head:

```html
<script type="application/ld+json">
  … contents of schema.jsonld …
</script>
```

- [ ] Validate at https://validator.schema.org/
- [ ] Confirm it's in the **served** HTML, not injected client-side

Worth ~6 points of citation readiness. It's the largest single item left.

## 3. Then mirror to Medium

Use **Import a story**, not copy-paste — the importer sets `rel=canonical` back
to the original automatically. Copy-paste does not, and you end up competing
with yourself.

- [ ] Import from the live moi.technology URL
- [ ] Confirm the canonical points home (Story Settings → Advanced)
- [ ] **Re-upload the chart as PNG** — Medium does not accept SVG
      (`chart-payment-layer-loc.png`, 1520×800, already rendered)
- [ ] Check the code blocks survived the import

## 4. Social

- [ ] Replace `CANONICAL_URL` in `social-pack.md` (appears in all three posts)
- [ ] Decide the `$2.9 billion` question: the X thread, LinkedIn and Reddit
      posts still lead on the BEC figure that was cut from the blog. Not wrong,
      but the hook no longer matches the post.

---

## Current state

| | |
|---|---|
| Words | 3,193 (~13.7 min) |
| AI citation readiness | 80/100 |
| Blog quality | 69/100 |
| External links | 27 unique, all resolving |
| Line counts | recounted, accurate as of this commit |

The 69 is depressed by two artifacts: "no JSON-LD" (fixed at step 2) and a
readability penalty for being *too* easy to read (Flesch 86.9 vs a 60–70
target). Neither is a real defect.
