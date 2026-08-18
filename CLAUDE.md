# Milk & Honey — app repo

Unified Music + Sports talent-management app. React/Vite SPA in `src/App.jsx`,
CommonJS Vercel functions in `api/`, Google Sheets as the database, deploys on
push to main (verify the served bundle hash after pushing — the webhook has
been flaky). Live at www.milkandhoneyfamily.com.

## Design parameters

The app's visual language, distilled from what's already built plus agreed
principles. Follow these for ALL UI work; when existing code disagrees with a
parameter, migrate toward the parameter as you touch that code.

**Theme.** Dark is the default; light mode via `[data-theme="light"]` tokens
(`--mh-*` CSS vars defined in THEME_CSS at the top of App.jsx, consumed through
the `G` object). Never hardcode a color that must respond to theme — use `G`.
Literal hexes only where alpha-concat requires them (documented inline) or for
the hero-gradient anchor `#080809`.

**Color.** One accent: the green (`G.green`). Use it for actions, selection,
success, and links — never decoration. Semantic colors: red = danger/loss,
amber = in-progress/warning, green = success/win. If a color carries no
meaning, it should be a neutral. Dark-mode depth comes from surfaces lighter
than the background (`G.surface` > `G.bg`), not shadows; light-mode shadows
stay at the current barely-there levels (1%/1%) — popover/menu shadows
(`G.shadowLg`) are the only strong ones. If a shadow is the first thing you
notice, it's wrong.

**Typography.** One typeface (the system sans in `ff`). Type scale — pick from
these sizes only: 10 (uppercase labels, letter-spacing 0.08–0.12em), 11.5
(captions/hints), 13 (body/controls), 15 (emphasized body), 17–18 (modal/card
titles), 23–24 (page titles), 28–38 (profile name / hero only). Content text
in dashboards never exceeds 24. Large display text gets tight treatment:
letter-spacing −2 to −3% and line-height 1.05–1.2 (already standard on
headings — keep it).

**Hierarchy.** Contrast makes hierarchy: size, weight, and color TOGETHER.
Most important thing biggest/boldest and first; money and scores may be
right-aligned and accented to draw the eye. Label–value pairs render as
uppercase 10px tertiary label OVER bold 14px value (the "Apparel & gear" grid
pattern) — never as same-size prose lines, which read as a spreadsheet.
Photos wherever possible (Avatar with initials fallback is the standard).

**Spacing.** 4-point system: 4/8/12/16/20/24/32. Section rhythm ~20–24px
between modules, 32 between page-level blocks; group related elements tighter
(4–8) to show they belong together. Don't invent 9/11/13/14px paddings in new
code.

**Signifiers & states.** Everything interactive must LOOK interactive: hover
states on rows/cards/buttons (background shift to `G.surfaceRaised` is the
house pattern), active nav underlined or filled, disabled = grayed +
cursor change. Every async action shows progress in place ('Saving…',
'Preparing…', spinner) and every completed action gives visible feedback —
prefer a small toast/chip confirmation over silent modal-close. Buttons need
default/hover/busy/disabled at minimum. Selects and inputs show focus.

**Icons & buttons.** Icons match the line-height of adjacent text (14–15px
next to 13px text — don't oversize). Sidebar items are ghost buttons (no
background until hover). Button padding ≈ height:width 1:2.

**Overlays.** Text over images always gets a linear gradient to a readable
ground (hero banners end at literal `#080809` in both themes); never raw text
on image, never a flat full-screen dim.

**Tables.** Zebra rows (`G.surfaceRaised` on odd), uppercase 10px header row,
`fontVariantNumeric: tabular-nums` on numeric columns, right-align numbers,
row hover highlight, own `overflow-x` container.

## Hard rules (non-negotiable)

- Public/b2b sessions must never see: internal data (addresses, emails,
  phones, notes, staff info), Edit controls, monthly listeners on client
  pages, Documents/Brand Deals modules. The API strips fields
  (PUBLIC_FIELDS/pickPublic) — the UI must not reintroduce them.
- Never write plaintext secrets into the sheet or the repo.
- After every push: `curl -s https://www.milkandhoneyfamily.com | grep -o
  'assets/index-[^"]*\.js'` must match the local dist build before claiming
  a deploy landed.
- 247Sports: bot detection fingerprints TLS — Node fetch gets 403/406; the
  server routes 247 through the residential proxy (may still be blocked;
  check), local scripts must shell out to curl. Keep request volume polite.

## Data

The Google Sheet is the database (SPORTS_SHEET_ID / MUSIC_SHEET_ID env).
Tab-by-tab dictionary lives in `~/milk-and-honey-data/CLAUDE.md` (Tyler's
analyst workspace) — keep that file updated when schema changes here.
