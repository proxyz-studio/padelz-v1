<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:padelz-brand-guide -->
# Padel-Z brand + design language (2026-05-19, commit 7d89a39)

Padel-Z is the exception to the PROXYZ Studio "dark editorial + hot pink + IBM Plex" identity in `~/.claude/CLAUDE.md`. It runs its own white-bg single-spec discipline inspired by [niklasrosen.se](https://niklasrosen.se). Apply this guide to every new page, component, or surface.

## The single-spec discipline

ONE typeface, ONE size, ONE color, ONE tracking — everywhere. Bio, nav, table headers, table rows, footers, form labels all share these specs:

- **Font**: `var(--font-inter)` (`Inter` 400 from `next/font/google`)
- **Size**: 24px desktop, 18px ≤720px (set on `body`, inherited everywhere)
- **Tracking**: `-0.72px` desktop, `-0.4px` ≤720px
- **Line height**: 1.15 desktop, 1.2 mobile
- **Weight**: 400 default. Use `font-bold` (700) only for action words and winning data — see "Bold = …" below.

Don't introduce display headings, secondary type scales, or different fonts. If you need emphasis, use color or bold, never size.

## The five colors

Declared as CSS variables in `src/app/globals.css` and exposed as utility classes:

| Token | Hex | Class | Purpose |
|---|---|---|---|
| `--color-bg` | `#ffffff` | (default) | Background. Always white. |
| `--color-fg` | `#1a1a1a` | (default) | Body text. Soft near-black, never pure `#000`. |
| `--color-fg-mute` | `#b7b7b7` | `.mute` | Secondary: meta, descriptive context, dividers, helper text. |
| `--color-rule` | `#ededed` | `.rule`, `.rule-bottom` | Hairline horizontal rules between rows and sections. |
| `--color-pink` | `#ff4193` | `.pink` | **Reserved**. Only the `Z` in `Padel-Z` and the `platinum` tier label. Never decorate with this. |

## Functional color — color does the work, not decoration

Three semantic colors, applied to text only (never as backgrounds, borders, or chrome). The rule: **strip a color and the meaning is still there.**

| Class | Hex | When to use |
|---|---|---|
| `.fn-red` | `#dc2626` | Destructive · cancel · dispute · void · voided · conflict of interest · disputed status · errors |
| `.fn-green` | `#16a34a` | Success · win · confirmed · locked-in · positive primary action (Submit, Confirm, Register) |
| `.fn-blue` | `#2563eb` | Data entry · admin edit · score inputs · Override · Set score · Save override · admin_set status · diamond tier label |

Examples that work:
- A pending score `21 – 15`: the winning number gets `.fn-green.font-bold`, the losing stays default neutral.
- An admin's Override link: `.fn-blue.font-bold` because clicking opens a writable form.
- "Conflict of interest": `.fn-red.font-bold` — the admin is locked out of acting on this row.
- The Padel-Z `Z`: `.pink.font-bold` — brand, not function.

## Bold = "the word that tells you what just happened or what to do next"

Use `font-bold` together with the functional colors:
- Action verbs the user clicks: **Submit score**, **Confirm**, **Override**, **Set score**, **Save override**, **Cancel**, **Dispute**, **Void match**
- Status keywords that signal state: **Confirmed**, **Disputed**, **Voided**, **Admin set**, **Locked in**, **Conflict of interest**, status of the active tournament (**open**, **in progress**)
- Winning scores in `21 – 15` pairs (just the winner, not both)
- Player/team display names when surfaced as the focused entity
- The `Z` in `Padel-Z`

Don't bold: muted meta, descriptive subtitles, separators (`vs`, `–`, `·`), inactive statuses (Pending stays plain — passive state).

## Layout primitives

All defined in `globals.css`. Reach for these first; don't invent.

- **Page padding**: `px-4 pb-8` on the root container of each page. Layout adds the header/nav.
- **Section header**: short paragraph in default 24px + an optional `.mute` second line below.
- **`.rule`** + a grid row of `.mute` column headers, before each table.
- **`.table`**: universal table treatment — left-align, 16px/12px cell padding, `1px solid #ededed` between rows, mute headers. Rows underline on hover except `.score`, `.year`, `.no-underline`.
- **`.score-input`**: bare input — transparent bg, single bottom border, focus border switches to `.fn-blue`. Use for any score field.
- **`.btn-link`**: text-as-button. No background, no border, inherits parent type. Use this for every button; never reach for chrome.
- **Arrow column**: 56px wide, right-aligned, contains a single `→` link.

## What NOT to add

- Background colors on elements (other than white). No tinted panels, no card surfaces, no hero blocks.
- Borders on anything except hairline rules between rows/sections.
- Display headings or alternate type scales.
- Multiple font weights beyond 400/700.
- Icons (use `→` for navigation and `↓` for scroll cues; that's the whole icon set).
- Animations, transitions, shimmer, mesh gradients, ticker, blur overlays.
- Uppercase text or wide letter-spacing for labels.
- The dark mode / black background / hot-pink-everywhere PROXYZ language.

## File tour

- `src/app/globals.css` — all tokens, primitives, utility classes
- `src/app/layout.tsx` — loads Inter font, wraps Nav + main + Footer
- `src/components/Nav.tsx`, `Footer.tsx`, `TierBadge.tsx` — flat shared chrome
- `.preview/scoring-niklas-philosophy.html` — frozen reference of the agreed design study; gitignored
- Reference inspiration: [niklasrosen.se](https://niklasrosen.se)

## When in doubt

Look at `/leaderboard`, `/t`, `/c/[slug]/admin/tournaments/[id]/scores`. Those three pages are the canonical patterns. Match them exactly.
<!-- END:padelz-brand-guide -->
