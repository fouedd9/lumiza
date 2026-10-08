# LUMIZA Agent Instructions

These instructions apply throughout this repository.
Follow the user's authorized scope; do not treat a proposal as approval.
Verify current sources before acting: documentation can lag behind the code.

## 1. Project Overview

LUMIZA is a single-product e-commerce application localized in French, English,
and German. Frontend and backend share one Next.js application.

- Stack: Next.js 16 App Router, React 19, strict TypeScript, Tailwind CSS 4,
  Supabase PostgreSQL, Stripe Embedded Checkout, next-intl, Zod, and Vitest.
- `package.json` and `package-lock.json` define dependencies and exact versions.
- `src/app/[locale]`: localized pages; `src/app/api`: HTTP endpoints.
- `src/features`: product, commerce, email, Telegram, analytics, and consent.
- `src/components`: shared UI, layout, sections, themes, and legal components.
- `src/config`, `src/i18n`, and `messages`: configuration and FR/EN/DE content.
- `supabase/migrations`: historical SQL; `supabase/production`: fresh setup SQL.
- `tests`: unit, component, API, and static SQL contract tests.

Responsibility boundaries:

- Frontend collects selections and displays quotes; browser data is untrusted.
- API routes validate requests and enforce HTTP security boundaries.
- Commerce services orchestrate checkout, confirmation, and payment events.
- Repositories provide server-only Supabase access and RPC calls.
- PostgreSQL validates catalog data, snapshots prices, and atomically manages
  orders, reservations, inventory allocations, and payment-event deduplication.

## 2. Architecture & Coding Standards

- Preserve the existing feature/domain/service/repository organization.
- Prefer Server Components for rendering and server-side data access.
- Use Client Components only where browser interaction or state requires them.
- Keep privileged integrations in `server-only` modules; preserve `.server.ts`
  boundaries and never import their runtime code into client components.
- Follow `tsconfig.json`, `eslint.config.mjs`, and `.prettierrc.json`.
- Keep TypeScript strict; avoid `any`, unsafe assertions, and suppressed checks.
- Use the `@/*` alias and existing file naming and formatting conventions.
- Reuse existing components, domain functions, services, and utilities.
- Validate external inputs with Zod; retain SQL constraints as a second boundary.
- Preserve locale parity in `messages/fr.json`, `en.json`, and `de.json`.
- Reuse semantic styling tokens in `src/styles/globals.css`.
- Explain and obtain human approval before adding a dependency.
- Prefer small, focused changes. Do not refactor unrelated code
  or modify unrelated files unless explicitly requested.
- When documentation and implementation disagree, inspect the
  current source and tests, report the discrepancy, and request
  clarification before changing business-critical behavior.
- Read `docs/architecture.md` before making architectural changes.
- Read `docs/business-rules.md` before modifying commerce logic.

## 3. Business Invariants

Obtain prior human approval before changing any rule in this section.
Stop and request approval if a task requires different business behavior.

Catalog and cart (`src/features/product/data/product.ts` and
`src/features/commerce/schemas/cart.ts`):

- Product SKU: `LUMIZA-LED-01`; finishes: `black`, `gold`, `silver`.
- SOLO: 1 lamp, initial price 3499 EUR cents.
- DUO: 2 lamps, initial price 5999 EUR cents.
- PRO: 10 lamps, initial price 24999 EUR cents.
- Mixed finishes are supported; nonnegative integer counts must sum to pack size.
- Each line has 1–10 packs; checkout accepts 1–10 lines and at most 30 lamps.
- Duplicate pack/composition lines are rejected; quantity means number of packs.

Pricing and shipping (`src/features/commerce/domain/{pricing,shipping,catalog-guard}.ts`):

- Calculate money in integer EUR cents; never trust browser-supplied amounts.
- Current database pack prices are snapshotted during reservation and used to
  price Stripe sessions; initial local prices are not a fixed checkout override.
- Verify snapshots, totals, compositions, and finish allocations before charging.
- Allow only FR, BE, DE, CH; charge shipping once per order: FR 0 cents,
  BE/DE/CH 1000 cents. Stripe restricts delivery to the selected country.
- No automatic tax calculation is configured; do not invent VAT/customs rules.

Inventory and payments (`src/features/commerce/services`, `domain/states.ts`,
and the commerce SQL functions):

- Reserve global and per-finish stock atomically using the existing lock order.
- Reservable stock is physical quantity minus reserved quantity.
- Preserve attempt-ID deduplication and the Stripe idempotency key
  `lumiza-checkout-${checkout_attempt_id}` across retries.
- Checkout proposes a 31-minute session expiry; the SQL hold adds 5 minutes.
- Preserve states: `creating_session`, `session_unknown`, `pending_payment`,
  `payment_processing`, `paid`, `failed`, `expired`.
- Verify webhook signatures against the raw body before processing events.
- Re-fetch current Stripe state; validate mode, currency, amount, and country.
- Deduplicate payment events and change inventory in the same SQL transaction.
- Commit stock only on verified completed payment; preserve terminal release rules.
- A failed card attempt in an open session does not immediately release stock.
- Keep reservations on uncertain outcomes; browser departure is not cancellation.
- Cancellation expires/verifies Stripe state before releasing an unpaid hold.
- Confirmation is read-only and never marks an order paid.
- Preserve existing email/Telegram isolation from committed payments and their
  retry semantics; the email provider is currently disabled.
- Never reset existing stock, rewrite sales history, or bypass fresh-schema guards.

## 4. Security & Data Protection

- Never expose secrets in source, chat, logs, HTML, analytics, or test fixtures.
- Never prefix privileged keys with `NEXT_PUBLIC_`; public keys are not service keys.
- Preserve `src/config/commerce-env.server.ts` validation and TEST/LIVE checks.
- Never change Stripe LIVE configuration without explicit human approval.
- Use mocks or isolated local/TEST environments; never test against production.
- Do not run remote migrations without explicit authorization for that operation.
- Preserve RLS, table grants, RPC execution restrictions, and SQL `search_path`.
- Commerce access is server-only; do not introduce browser access to order tables.
- Protect customer data, confirmation tokens, and Stripe client secrets; avoid
  disclosing them in URLs sent to third parties, logs, or persistent browser storage.
- Preserve origin checks, body limits, reconciliation authentication, private-page
  cache/indexing protections, and security headers.
- Preserve optional-off consent and analytics/marketing consent boundaries.
- Inspect actual environment requirements without printing `.env.local` values.

Known limitation: the production bootstrap currently omits Telegram objects and
phone capture added by the historical migrations. Read
`docs/production-database.md` alongside the SQL and repository calls; do not
assume a complete remote schema or execute historical TEST stock resets to fix it.

## 5. Development Workflow

1. Understand the request, acceptance criteria, and authorized scope.
2. Inspect affected sources, tests, SQL, documentation, and working-tree changes.
3. Propose a plan before significant edits; wait when approval is requested or required.
4. Implement only necessary changes; preserve unrelated user work.
5. Run checks appropriate to the change and its risk.
6. Fix introduced errors and rerun affected checks.
7. Report changes, decisions, verification results, and remaining risks.

## 6. Quality Gates

Available validation commands in `package.json`:

```sh
npm run lint
npm run typecheck
npm run test:run
npm run build
```

- Run relevant tests for focused changes; run all four gates for significant code changes.
- For documentation-only edits, check accuracy and formatting; explain skipped gates.
- Never claim a test or build passed unless executed; report failures and blockers.
- Mocked integrations and textual SQL assertions do not prove PostgreSQL behavior.
- The unified validation command is `npm run validate`.
- It runs Prettier, ESLint, TypeScript, Vitest, and the Next.js build.
- `npm run format` rewrites files: do not use it broadly for a scoped task.

## 7. Git & Deployment Rules

- Work on the current branch; verify it before edits. Never edit directly on `master`.
- If on `master`, arrange an authorized working branch before changing files.
- Do not reset, clean, discard changes, or rewrite history without authorization.
- Never create a commit or push without authorization for that action.
- Never merge a pull request without human validation.
- Never intentionally trigger a production deployment without authorization.
- Do not assume GitHub branch protections or Vercel settings from local files.

## 8. Agent Reporting

At the end of each task, report:

- Files changed and their purpose.
- Technical decisions and any impact on business invariants.
- Checks actually executed, outcomes, and checks skipped with reasons.
- Unresolved issues, limitations, and material risks.
- Actions requiring the owner's approval; never imply approval was granted.
