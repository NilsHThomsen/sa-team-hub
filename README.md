# SA Team Hub

A live dashboard and agent for running a Solutions Architect team: achievements, skills and enablement, development plans, deal coverage, and manager-only talent data (retention, succession, warm bench, promotion cases). It turns the parts of an SA leader's business plan that usually live in spreadsheets into something the team updates by talking to an agent.

Built on Vercel: **eve** for the agent, the **AI SDK** for structured generation, **AI Gateway** for model routing and spend tracking, and **Workflows** for the durable promotion-case flow. Apart from the manager (the author), all people and data are fictional.

## Try it

Sign in as **Nils Thomsen** (manager) or any IC, such as **Priya Nair**, with the demo password (default `team-hub-demo`). Try asking, as an IC, "What is Tom Becker's retention risk?" to see the refusal.

## What it does

| Area | Dashboard | Agent |
| --- | --- | --- |
| Home | Personal action items (approvals, deals to update, forecast conversations, overdue plans, retention follow-ups, goals and certifications due), recent wins, weekly digest | `get_my_action_items` ("what should I do today?") |
| Achievements Doc | Team wins (managers) or your own (ICs) | `log_achievement`: "Log a win: I ran the Next.js 16 migration workshop for Acme", `edit_achievement` to fix or remove one |
| Shout-outs | Recipients accept or decline from Action items on Home; senders see each one's status on Achievements. Accepted ones join the recipient's achievements doc | `send_shoutout` (workflow task: parks on a webhook with a 6-hourly backstop check, expires after 7 days, DMs the recipient if their Slack is linked), `respond_to_shoutout` ("accept" in chat or a Slack DM) |
| Skills Matrix | People as columns with product skills, certifications and soft skills as row sections (or the original per-person tables), gaps against next quarter's needs | `find_skill_gaps`, `get_person_profile`, `update_skill` (SAs their own, managers anyone's), `update_skill_need` (managers: next quarter's needs) |
| Development Plans | Grouped under each person's career goal (Principal SA, Manager, Product Manager...), with goals, next steps and overdue flags. SAs change their own goal from the page; managers can change anyone's | `update_career_goal` and `update_dev_plan` (both ask to confirm), read via profile |
| Deal Coverage | Top 5 deals this quarter (Vercel's financial year, February to January, e.g. "FY27 Q3") as a scorecard (deliverables done, SA stage, SA comments, score), stage 2+ coverage, stale next steps, missing technical wins, overloaded SAs | `review_deal_coverage`, `update_deal_next_step` (SAs update their own deals, confirm before saving, logged in `deal_updates`), `update_deal_scorecard` (same rules), `manage_deal` (managers: create deals, assign SAs, change stage, ACV, quarter, forecast) |
| Talent (managers only) | 9-box (2P matrix: performance against potential), retention risk, promotion cases, succession, warm bench | `get_talent_overview`, `update_talent_rating` and `update_retention_risk` (both ask to confirm), `draft_promotion_case` (workflow) and `decide_promotion_case`; drafts can also be approved or declined from Talent or Home; `update_succession`, `update_warm_bench`, `update_team_member` |
| Settings (managers only) | Choose the primary model from a short list of AI Gateway models. New chats, the digest and promotion cases pick it up; open chats keep theirs | Read once per session by a `defineDynamic` model in `agent/agent.ts` |
| Slack | DM the bot or @mention it: "log a win…", "update Aurora…". Approvals become buttons. Only people linked on Settings get in; shared channels get SA-level access only | `agent/channels/slack.ts` (eve Slack channel via Vercel Connect), `save_weekly_digest` also posts the digest to `SLACK_DIGEST_CHANNEL` (re-saving edits the same post) |
| Weekly digest | Shown on the home page | `friday-digest` schedule, Fridays 06:00 UTC |

## Architecture

```
Browser ──► Next.js 16 (App Router)
             ├─ proxy.ts           gate: valid session cookie or /login
             ├─ app/(hub)/*         dashboard pages (server components)
             ├─ app/s               chat UI (useEveAgent); "Ask the agent" opens it as a side panel on any page
             └─ /eve/v1/*  ──►  eve agent (withEve)
                                  ├─ channels/eve.ts   verifies the same cookie
                                  ├─ instructions.md   router: handles everyday asks, hands the rest to a specialist
                                  ├─ tools/*           everyday tools: action items, achievements, shout-outs, digest
                                  ├─ subagents/*       each with its own agent.ts, instructions.md, tools/ and skills/
                                  ├─ subagents/deals             coverage, scorecard, next steps, deal admin
                                  │    └─ skills/technical-win-plan.md
                                  ├─ subagents/skills_and_plans  skills matrix, gaps, dev plans, career goals
                                  │    └─ skills/dev-plan-coaching.md
                                  ├─ subagents/talent            managers only (defineDynamic: absent for SAs)
                                  │    ├─ draft_promotion_case   Workflow: gather → score → draft (AI SDK) → save → ask manager (or Talent / Home buttons) → decide
                                  │    └─ skills/promotion-cases.md
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
4. **The agent** starts with `defaultTools: false` (and the subagents disable the shell, file and web tools explicitly), so it has only the tools listed above, and unknown callers fail closed (`actorFromAuth`).
5. **Subagents**: the main agent routes to three specialists, each with its own instructions, tools and skills. They run with the caller's own sign-in, so the same rules apply inside them. The `talent` specialist is resolved per session with `defineDynamic` and simply doesn't exist for SAs, the digest schedule or shared Slack channels.

The demo sign-in (pick a person plus a shared password) stands in for SSO. Swapping it for Okta or Sign in with Vercel only changes how the cookie is issued.

### Reliability and cost

- Tool writes are idempotent: `log_achievement` uses the tool call id as a unique key, so a replayed step cannot double-log, and the promotion workflow saves on its call id.
- The promotion case is a durable Workflow: each step is checkpointed, and the manager's approval can arrive hours later without holding a function open.
- AI Gateway falls back to a second provider if the primary is down, tags every call with `app:sa-team-hub` and `feature:*` for spend reporting, and each session has a cost cap (`maxTokenCostUsdPerSession: 1`).
