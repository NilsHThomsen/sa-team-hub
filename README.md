# SA Team Hub

A live dashboard and agent for running a Solutions Architect team: achievements, skills and enablement, development plans, deal coverage, and manager-only talent data (retention, succession, warm bench, promotion cases). It turns the parts of an SA leader's business plan that usually live in spreadsheets into something the team updates by talking to an agent.

Built on Vercel: **eve** for the agent, the **AI SDK** for structured generation, **AI Gateway** for model routing and spend tracking, and **Workflows** for the durable promotion-case flow. All people and data are fictional.

## What it does

| Area | Dashboard | Agent |
| --- | --- | --- |
| Achievements Doc | Team wins (managers) or your own (ICs) | `log_achievement`: "Log a win: I ran the Next.js 16 migration workshop for Acme" |
| Skills Matrix | Product depth, certifications, enablement, gaps against next quarter's needs | `find_skill_gaps`, `get_person_profile` |
| Development Plans | Grouped under each person's career goal (Principal SA, Manager, Product Manager...), with goals, next steps and overdue flags. SAs change their own goal from the page; managers can change anyone's | `update_career_goal` (asks to confirm), read via profile |
| Deal Coverage | Stage 2+ coverage, stale next steps, missing technical wins, overloaded SAs | `review_deal_coverage`, `update_deal_next_step` (SAs update their own deals, confirm before saving, logged in `deal_updates`) |
| Talent (managers only) | Retention risk, promotion cases, succession, warm bench | `get_talent_overview`, `update_retention_risk` (asks to confirm), `draft_promotion_case` (workflow) |
| Settings (managers only) | Choose the primary model from a short list of AI Gateway models. New chats, the digest and promotion cases pick it up; open chats keep theirs | Read once per session by a `defineDynamic` model in `agent/agent.ts` |
| Weekly digest | Shown on the home page | `friday-digest` schedule, Fridays 06:00 UTC |

## Architecture

```
Browser ──► Next.js 16 (App Router)
             ├─ proxy.ts           gate: valid session cookie or /login
             ├─ app/(hub)/*         dashboard pages (server components)
             ├─ app/s               chat UI (useEveAgent)
             └─ /eve/v1/*  ──►  eve agent (withEve)
                                  ├─ channels/eve.ts   verifies the same cookie
                                  ├─ tools/*           role-checked tools
                                  ├─ draft_promotion_case   Workflow: gather → score → draft (AI SDK) → save → ask manager → decide
                                  ├─ skills/promotion-cases.md
                                  └─ schedules/friday-digest.md
             agent/lib/data.ts  ◄── one data layer for pages and tools, access rules next to the SQL
                    │
                 Postgres (Neon)
Models: AI Gateway. A manager picks the primary model on /settings (default anthropic/claude-sonnet-5);
        Gateway falls back to another provider, and every call is tagged per feature
```

### Security: individual input vs management eyes only

One HS256-signed, httpOnly session cookie is read by both the Next.js proxy and the eve channel, so the dashboard and the agent always agree on who is asking. Roles are `ic` and `manager`, and each rule is enforced in more than one place:

1. **Pages**: the Talent nav link is hidden from ICs, and the page checks the role again for a typed URL.
2. **Tool approval policies** (`agent/lib/policies.ts`): manager-only tools are denied before they run for anyone else; retention changes need the manager to confirm in chat.
3. **Data layer** (`agent/lib/data.ts`): every query takes an `Actor`. ICs are forced to their own achievements, plans and deals; manager-only tables throw `AccessDenied`. The scheduled digest runs as eve's app principal, which can write digests but cannot read retention data.
4. **The agent** starts with `defaultTools: false`, so it has only the tools listed above, and unknown callers fail closed (`actorFromAuth`).

The demo sign-in (pick a person plus a shared password) stands in for SSO. Swapping it for Okta or Sign in with Vercel only changes how the cookie is issued.

### Reliability and cost

- Tool writes are idempotent: `log_achievement` uses the tool call id as a unique key, so a replayed step cannot double-log, and the promotion workflow saves on its call id.
- The promotion case is a durable Workflow: each step is checkpointed, and the manager's approval can arrive hours later without holding a function open.
- AI Gateway falls back to a second provider if the primary is down, tags every call with `app:sa-team-hub` and `feature:*` for spend reporting, and each session has a cost cap (`maxTokenCostUsdPerSession: 1`).

## Run it locally

Requires Node 24 and Postgres.

```bash
npm install
cp .env.example .env.local     # set AUTH_SECRET and AI_GATEWAY_API_KEY
npm run db:setup               # creates tables and seeds the fictional team (db:reset to start over)
npm run dev                    # dashboard on http://localhost:3000
npm test                       # access-rule tests against the seeded database
```

Sign in as **Jordan Hayes** (manager) or any IC, such as **Priya Nair**, with the demo password (default `team-hub-demo`). Try asking, as an IC, "What is Tom Becker's retention risk?" to see the refusal.

## Deploy to Vercel

1. Import the repo into a Vercel project.
2. Add **Neon** from the Vercel Marketplace (sets `DATABASE_URL`).
3. Set `AUTH_SECRET` (32+ characters) and `DEMO_PASSWORD`.
4. Seed once: `vercel env pull .env.local && npm run db:setup`.
5. Deploy. AI Gateway authenticates with the project's OIDC token, so no model keys are needed.

## Built with AI assistance

I used Claude (Claude Code) to help write this code. The design, the data model and the access rules are mine to explain.
