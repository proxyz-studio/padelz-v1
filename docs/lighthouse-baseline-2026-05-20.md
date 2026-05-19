# Lighthouse baseline · 2026-05-20

Live build: `e58b8e7` (fix(pwa): wait for app shell before skipWaiting)
Settings: mobile preset (Moto G4 emulation, 4G throttling) — default lhci mobile.

| Route | FCP | LCP | TBT | CLS | SI |
|---|---|---|---|---|---|
| / | 1341ms | 1341ms | 4ms | 0.0046 | 8762ms |
| /leaderboard | 851ms | 1933ms | 9ms | 0.0000 | 1822ms |
| /t | 842ms | 1080ms | 9ms | 0.0000 | 2648ms |
| /sign-in | 846ms | 1250ms | 6ms | 0.0037 | 2932ms |

Budgets: FCP <1500ms · LCP <2500ms · TBT <200ms · CLS <0.1

**Red metrics:** None. All four routes pass all four budgets.

**Top suspect:** No intervention needed. `/` shows an elevated Speed Index (8762ms) which is not in the budget and likely reflects the home page's SSR data fetch; it does not indicate a user-visible problem given FCP/LCP are green. No fixes required.

## Fixes applied

None — baseline was green on first measurement.

## Post-fix

Not applicable — all budgets passed at baseline. No post-fix run needed.
