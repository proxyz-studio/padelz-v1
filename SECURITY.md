# Security

Padel-Z follows the PROXYZ Studio SMB security playbook
(`Shared drives/PROXYZ Studio/04-Projects/SMB/Web-Service/05-Security`).
Philosophy: **assume breach, validate everything, trust nothing**. Default to
least privilege.

## Reporting a vulnerability

Please **email security@proxyz.studio** rather than opening a public GitHub
issue. Include:

- A short description of the issue
- The URL or code path affected
- Steps to reproduce
- Your assessment of the severity

We acknowledge reports within 24 hours and remediate high-severity findings
within 7 days. We do not run a public bug bounty.

## Scope

In scope:

- The Padel-Z production deployment at `padelz.proxyz.studio` and its current
  Vercel canonical alias (`padelz-v1.vercel.app`)
- The source repository at `proxyz-studio/padelz-v1`

Out of scope (report to the vendor instead):

- Vulnerabilities in third-party services we depend on (Clerk, Vercel, Neon,
  Upstash, Sentry)
- DDoS / volumetric attacks — we rely on Vercel's edge for those
- Social engineering against PROXYZ staff
- Physical or AppSec issues unrelated to the web application

## What's in place

| Layer | Posture |
|---|---|
| HTTPS / HSTS | Vercel provisions Let's Encrypt; HSTS at 2y preload |
| Security headers | CSP (Report-Only), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locks down camera/mic/geo |
| Authentication | Clerk (passwords, MFA, OAuth handled upstream) |
| Authorization | `src/libs/Authz.ts` ownership helpers (`assertPlayerOwner`, `assertClubAdmin`, `assertPlatformAdmin`) called by every M1–M4 Server Action that mutates shared resources |
| Input validation | Zod schemas at every Server Action boundary |
| SQL injection | Drizzle ORM parameterizes everything; no template-string SQL anywhere |
| Secret management | t3-oss `Env.ts` validates 9 keys at module load; `.env*` gitignored; Vercel encrypted env for production |
| Rate limiting | Upstash Ratelimit (sliding-window) applied in `src/proxy.ts` to auth, webhook, score-submit, registration, profile-edit paths. Fails open if Upstash is unavailable. |
| Logging | Pino with redact list covering authorization, cookie, password, email, phone, userId, user_id, clerk_id |
| Error monitoring | Sentry server + client + edge configs; per-request `x-request-id` propagation for log correlation |
| Dependency hygiene | Dependabot weekly PRs (npm + github-actions); `npm audit --audit-level=critical` enforced in CI |
| Service worker | Stale-while-revalidate caches the shell only; API and `_next/*` requests bypass cache |

## Open advisories

| CVE / Advisory | Component | Status | Notes |
|---|---|---|---|
| GHSA-gpj5-g38j-94v9 | `drizzle-orm <0.45.2` | **Tracked** | SQL injection via unescaped identifiers. Padel-Z never passes user input as a table/column name, so the CVE doesn't fire in practice. Upgrade to `drizzle-orm@^0.45` + `drizzle-kit@^0.31` is a tracked follow-up. CI audit gate is at `--audit-level=critical` until that lands. |

When the drizzle upgrade ships, re-tighten the CI gate to `--audit-level=high`.

## Incident response plan

Adapted from `SMB/Web-Service/05-Security/incident-response-minimum.md`.

### When this plan fires

Any of:

- Suspected data breach (leaked credentials, unauthorized access)
- Site down more than 30 minutes
- Confirmed leaked secret (API key, DB password)
- User reports their data was visible to another user
- Sentry alert on a critical error pattern affecting many users

### The four phases

**1. Contain (first 30 minutes)**

- Acknowledge in the team channel: "INCIDENT: <one sentence>. I'm IC."
- Pick one Incident Commander (IC). Everyone else takes orders.
- Block the attack vector if known: rotate the leaked secret, take down the
  broken endpoint, flip a feature flag, raise the rate limit.
- If user data is at risk, take the affected feature offline rather than leave
  it bleeding.

**2. Diagnose (next 30 to 120 minutes)**

- Pull logs from Sentry, Vercel, Neon, Upstash, Clerk for the relevant window.
- Identify scope: how many users affected, what data exposed, how long.
- Capture timestamps as you go — the timeline matters later.

**3. Recover (variable)**

- Deploy the fix. If unsure, deploy a stricter version that's slower but safe.
- Restore data if needed (from backup; verify row counts, never trust partial).
- Re-enable the feature only after IC says "we're good".

**4. Postmortem (within one week)**

Blameless. One page maximum. Use the SMB template.

### Communicating with users

If user data is exposed:

- Notify affected users within 72 hours (GDPR threshold)
- State: what happened, what data was exposed, what we've done, what they
  should do
- Don't bury the lede; plain language, top of the email
- Provide a contact email staffed by a real person for 30 days

## Tooling

- **Sentry** — runtime errors + alerts on error spikes
- **Vercel Deployment Protection** — production deploys require approval
  (pending Tew's enablement)
- **Database backups** — Neon point-in-time recovery (pending Neon provisioning)
- **Feature flags** — TBD; will be added before launch if scoping demands
- **Rate limiting** — Upstash; rules in `src/proxy.ts`

## Rotation schedule

- **Quarterly:** production DB password (Neon), Clerk JWT signing key,
  Sentry DSN
- **Immediately:** any key suspected to have leaked
- **On offboarding:** when a person with access to any secret leaves PROXYZ

Rotation procedure: rotate at the source → update Vercel env → trigger a redeploy
→ confirm new value is live → audit logs for unauthorized use.
