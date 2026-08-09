# Kijun Design System

Kijun is a developer-tools brand: an editor whose agent reads a whole repository, edits across files, and shows its work as a readable timeline. The visual system reads as **quietly-confident developer editorial** — warm cream paper, warm near-black ink, magazine-weight display type, and a single unit of brand voltage (Kijun Orange) spent only on the primary call-to-action and the wordmark.

Two surfaces are represented:

- **Marketing site** — home, pricing, enterprise, blog. Cream bands at an 80px rhythm, white hairline cards, one product mockup card as the hero artefact.
- **Editor app** — file tree, tabbed editor, terminal, and the agent panel where the signature pastel timeline pills live.

## Sources

This system was authored from a **written brand specification supplied in chat** (tokens, type ladder, component inventory, do's and don'ts, responsive rules). There was **no codebase, Figma file, screenshot set, deck, or asset bundle attached** — the project directory was empty at the start.

Consequences the reader should know about:

- **No logo or brand mark exists in this system.** None was supplied, and none was drawn. Everywhere a mark would go, the word *Kijun* is set in plain type (weight 500, −2% tracking, orange or ink). See `guidelines/brand-wordmark.card.html`.
- **No photography, illustration, texture or background imagery** was supplied. The system is type, colour, hairlines and code surfaces only — that appears to be the brand's actual register, but it is also a gap.
- **No icon set** was supplied. See ICONOGRAPHY below for the substitution.
- **The licensed display face is not included.** See TYPE below.

If you have the real Figma file, repository, or font binaries, attach them and this system can be corrected against them.

---

## CONTENT FUNDAMENTALS

**Voice.** Calm, specific, slightly understated. The brand sounds like a senior engineer explaining a tool to another engineer — never like a launch announcement. Claims are concrete and checkable ("indexed 1,284 files in 2.1s"), never superlative ("blazing fast", "revolutionary").

**Person.** Second person for the reader, third person for the product. "Kijun plans, greps and edits across files." / "Point it at the repository you already have." First-person plural appears only in company voice (careers, security posts): "we re-index on save instead of on commit."

**Casing.** Sentence case everywhere — headlines, buttons, nav, card titles. The only uppercase in the system is the 11px `caption-uppercase` label with +0.88px tracking, used for section labels, pane labels, and timeline pill text. No title case, ever.

**Punctuation.** Headlines take a full stop when they are sentences ("The editor that reads your whole repo."). Em-dashes carry the editorial asides. Numbers are written as numerals with thousands separators.

**Length.** Hero headline: 4–8 words, one line at 72px. Subhead: one sentence, ≤ 20 words. Card body: 1–2 sentences. Button labels: 1–3 words ("Get started", "Download for macOS", "Contact sales").

**Emoji: never.** Not in product, not in marketing, not in the blog. The brand has no emoji register.

**Examples in this system**

| Slot | Copy |
|---|---|
| Hero headline | "The editor that reads your whole repo." |
| Hero subhead | "Kijun plans, greps and edits across files — and shows every step it took." |
| Section label | `WHY KIJUN` (11px uppercase, tracked) |
| Feature title | "Whole-repo context" |
| Feature body | "Every file is indexed locally, so the agent starts from your architecture instead of a snippet." |
| Primary CTA | "Get started" · "Download for macOS" |
| Comparison column | "Kijun" vs "Other tools" — never a named competitor |
| Empty/soft state | "Ask Kijun to change something…" |

**Don't:** exclamation marks; "supercharge", "10x", "magic"; feature names in Title Case; emoji bullets; a second CTA colour to create urgency.

---

## VISUAL FOUNDATIONS

**Canvas.** The page floor is warm cream `--color-canvas` #f7f7f4 — never pure white. White (`--surface-card` #ffffff) is a *card* colour: cards read as lifted because they are whiter than the page, not because they are shadowed. A third surface, `--color-canvas-soft` #fafaf7, is the inside of product panes.

**Ink.** Text is warm near-black `--text-ink` #26251e, running body `--text-body` #5a5852, sub-titles `--text-muted` #807d72, disabled `--text-muted-soft` #a09c92. No pure black anywhere.

**Brand colour.** One: Kijun Orange `--color-primary` #f54e00, with `--color-primary-active` #d04200 for press. It appears on the wordmark and on the single primary CTA of a band — at most one orange object in view. There is no secondary brand action colour; a second action is a white `secondary` pill or an ink `download` pill.

**The timeline palette.** Five pastels — peach (thinking), mint (grep), pastel blue (read), lavender (edit), warm gold (done). This is the brand's strongest signature and it is *scoped*: in-product agent visualizations only. Never as status colours, chart colours, badges, or marketing accents.

**Type.** One sans for everything (KijunGothic; substituted here — see below) and JetBrains Mono for every code surface, which is close to half of any given page. Display sits at **weight 400** with negative tracking (−2.16px at 72px down to −0.11px at 22px): the editorial move that keeps the brand out of tech-bombast. Titles are 600. Body is 400/1.5, occasionally +0.08px tracked for editorial passages.

**Spacing.** 4px base unit; 80px section bands; 96px on the pre-footer CTA band; 1200px max content width; 16–24px gaps between cards inside a band. Whitespace pacing is print-magazine, not app-dense.

**Depth: hairlines only.** `box-shadow` is not used anywhere in this system. Separation comes from 1px rules (`--hairline` #e6e5e0, `--hairline-soft` #efeee8, `--hairline-strong` #cfcdc4) and from white-on-cream contrast. Multi-pane mockups draw their dividers as 1px gaps over a hairline-coloured background.

**Corners.** 4px inline tags · 6px compact rows · **8px CTAs and inputs** · **12px cards and panes** · 16px large feature cards (rare) · pill for badges and timeline pills. The 8px CTA is deliberately compact — a developer dialect, not a consumer app's 999px pill.

**Cards.** White fill, 1px `--hairline` border, 12px radius, 24px padding, no shadow. The only variant is inversion: a featured pricing tier flips to ink `#26251e` with cream text. Highlighting is tonal, never a coloured ribbon or a coloured left border.

**Imagery.** None supplied. The brand's "image" is the product mockup card — a white card containing a multi-pane editor with real-looking code. If photography is ever introduced, keep it warm and low-contrast to sit on cream; do not introduce cool-grey or high-saturation imagery.

**Backgrounds.** Flat colour only. No gradients, no full-bleed photography, no repeating patterns, no grain, no blur, no transparency effects. Bands are separated by a 1px top hairline, not by a colour change — at most two background colours exist on a page (cream and white).

**Animation.** Not documented in the source, and therefore deliberately minimal here: 120–150ms ease transitions on colour only. No entrance animation, no bounce, no parallax, no scroll-jacking. If motion is added later, it should be short, linear-ish, and colour/opacity only.

**Interaction states.** Hover is intentionally undefined in the source brand and is *not* invented here — components change on **press** and **focus** only. Press: primary darkens to #d04200, secondary fills with `--surface-strong`, tertiary drops to muted. Focus: input border darkens to ink; a two-ring `--focus-ring` (canvas + warm-400) elsewhere. Errors: crimson border plus a 13px caption. No scale-down, no glow, no opacity fades on press.

**Layout rules.** Top nav is 64px, cream, with a bottom hairline; it is not sticky in the recreations. Content caps at 1200px and is centred. Grids: 3-up benefits, 2-up splits, 5-column footer. Breakpoints: hero drops 72 → 56 → 32px; nav becomes a hamburger below 768px; the product mockup collapses to its editor pane alone below 640px.

**Type substitution (flagged).** KijunGothic is licensed and was not supplied. `tokens/fonts.css` loads **Inter** (400/500/600) as the documented substitute — set display at weight 400 with roughly −1.5% tracking — plus **JetBrains Mono** for code. Both come from Google Fonts over CDN. **Please supply the KijunGothic binaries** (woff2) and this file becomes local `@font-face` rules with no other change.

---

## ICONOGRAPHY

**No icon set, icon font, SVG sprite, or PNG icon library was supplied with the brand, and none was drawn.** The written specification defines no iconography at all — the marketing surface it describes is text, type and code surfaces.

What that means in practice:

- **Marketing surfaces use no icons.** Feature cards lead with an 11px uppercase eyebrow, not a glyph. Nav and footer are pure type. This is faithful to the source, and it holds up: the brand's density comes from mono code, not from pictograms.
- **The editor app kit needs a small set of affordances** (folder, file, search, terminal, run history). It uses **[Lucide](https://lucide.dev) from CDN — 14px, 1.5px stroke, `--text-muted`** — as the closest neutral substitute for an unknown set. **This is a flagged substitution**; swap it for the real set when available (`ui_kits/editor_app/EditorScreen.jsx`, the `Icon` component, is the single place to change).
- **Emoji are never used** as icons or decoration.
- **Unicode is used sparingly as typographic marking, not as iconography**: `—` as the feature-list marker in pricing tiers, `›` for terminal output lines, `←` for the blog back link. Keep this restrained.
- **The agent timeline replaces status iconography.** Where another product would use a spinner, check or magnifier glyph, Kijun uses a coloured word-pill. Prefer a pill over inventing an icon.

`assets/` therefore contains no logo or icon binaries. See `assets/README.md`.

---

## Index

**Root**

| File | What it is |
|---|---|
| `styles.css` | The single entry point consumers link. `@import` list only. |
| `tokens/colors.css` | Base palette + semantic aliases (surfaces, hairlines, text, timeline, semantic). |
| `tokens/typography.css` | Font stacks, the 14-step type ladder, `.t-*` utility classes. |
| `tokens/spacing.css` | 4px scale, section rhythm, container, nav height. |
| `tokens/radius.css` | Radius scale (4 → pill). |
| `tokens/elevation.css` | Hairline borders + focus ring. Shadows resolve to `none` by design. |
| `tokens/fonts.css` | Inter + JetBrains Mono (substitute — see above). |
| `tokens/base.css` | Document defaults, heading ladder, link colours, selection. |
| `thumbnail.html` | Homepage tile for this system. |
| `SKILL.md` | Agent-Skills entry point for using this system outside the app. |

**Components** (`components/<group>/`)

| Group | Components |
|---|---|
| `actions/` | `Button` (primary · secondary · tertiary · download) |
| `agent/` | `TimelinePill` (thinking · grep · read · edit · done) |
| `code/` | `CodeBlock`, `IdePane`, `IdeMockupCard` |
| `content/` | `FeatureCard`, `TestimonialCard`, `ComparisonCard`, `PricingTierCard`, `Badge` |
| `forms/` | `TextInput` |
| `navigation/` | `TopNav`, `Footer`, `FooterLink` |
| `marketing/` | `HeroBand`, `CtaBand` |

Each directory carries a `@dsCard` HTML showing its variants, and each component has a `.d.ts` props contract and a `.prompt.md` usage note.

*Intentional additions:* `FooterLink` (exported alongside `Footer` because the spec documents `footer-link` as its own token-level component) and `IdePane` as a standalone export (documented as `ide-pane`). No component was invented beyond the supplied inventory; `button-primary-active` and `pricing-tier-featured` are implemented as states/props rather than separate components.

**Foundations** (`guidelines/*.card.html`) — 17 specimen cards across **Colors** (brand, surfaces, hairlines, text, timeline, semantic), **Type** (display, body, captions, mono, interface), **Spacing** (scale, rhythm), **Shape** (radius, hairline depth) and **Brand** (wordmark, orange scarcity).

**UI kits** (`ui_kits/<product>/`)

| Kit | Screens |
|---|---|
| `marketing_site/` | Home, Pricing, Enterprise, Blog (index + post). Click the nav. |
| `editor_app/` | Editor workspace with live agent timeline and prompt box. |

**Templates** (`templates/<slug>/`) — starting folders a consuming project can copy.

| Template | What it gives you |
|---|---|
| `landing-page/` | Full marketing page: 64px nav, 72px editorial hero with a product mockup card, 3-up feature grid, 96px CTA band, footer. |
| `agent-workspace/` | In-product surface: explorer, tabbed editor, terminal strip, agent panel with the five timeline pills and a prompt box. |

**Assets** — `assets/README.md` records that no brand assets were supplied.
