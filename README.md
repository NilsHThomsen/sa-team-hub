# SA Team Hub

A dashboard and agent for running a Solutions Architect team. It takes the parts of an SA leader's business plan that usually live in spreadsheets (achievements, skills, development plans, deal coverage and talent planning) and lets the team keep them up to date by talking to an agent.

Built on Vercel with **eve** (agent), the **AI SDK**, **AI Gateway** (models and spend tracking), **Workflows** (promotion cases and shout-outs) and **Neon** Postgres. Everyone except the manager (me) is fictional.

## What it does

| Area | Dashboard | Ask the agent to… | Agent | Tools |
| --- | --- | --- | --- | --- |
| Home | Your action items, recent wins and the weekly digest | "What should I do today?" | Main | `get_my_action_items`, `get_team_directory` |
| Achievements | Team wins (managers) or your own (SAs) | Log, fix or remove a win; send a teammate a shout-out, which they accept before it's added to their wins | Main | `log_achievement`, `edit_achievement`, `list_recent_achievements`, `send_shoutout`, `respond_to_shoutout` |
| Skills Matrix | Product skills, hyperscaler certifications and soft skills per person, and gaps against next quarter's needs | Find gaps, update a skill, set next quarter's needs (managers) | `skills_and_plans` (main can read gaps) | `find_skill_gaps`, `get_person_profile`, `update_skill`, `update_skill_need` |
| Development Plans | Plans grouped by career goal, with next steps and overdue flags | Update a plan or career goal | `skills_and_plans` | `update_dev_plan`, `update_career_goal` |
| Deal Coverage | Top 5 deals this quarter as a scorecard, SA coverage, stale next steps and overloaded SAs | Update next steps and the scorecard; create or reassign deals (managers) | `deals` (main can read coverage) | `review_deal_coverage`, `update_deal_next_step`, `update_deal_scorecard`, `manage_deal` |
| Talent (managers only) | 9-box, retention risk, promotion cases, succession and warm bench | Update any of these; draft a promotion case and approve or decline it | `talent` | `get_talent_overview`, `update_talent_rating`, `update_retention_risk`, `draft_promotion_case`, `decide_promotion_case`, `update_succession`, `update_warm_bench`, `update_team_member` |
| AI Usage (managers only) | AI spend by person, feature and model, with filters; prompt-cache share; this month against a budget, with a burn-down and a projected run-out date | | | |
| Settings (managers only) | Choose the AI model, set the monthly AI budget (US$100 by default) and link Slack accounts | | | |
| Slack | DM or @mention the bot; the weekly digest is posted to a channel | Anything above | Main, handing off to specialists | `save_weekly_digest` (also posts the digest) |

## Try it

Sign in as **Nils Thomsen** (manager) or any SA, such as **Priya Nair**, with the demo password `PasswordVercel`. Ask, as an SA, "What is Tom Becker's retention risk?" to see the agent refuse.

## Architecture

A one-page diagram is in [sa-team-hub-architecture.pdf](sa-team-hub-architecture.pdf), and the numbered request flows are in [sa-team-hub-flows.pdf](sa-team-hub-flows.pdf).

```
Browser ──► Next.js 16
             ├─ dashboard pages
             ├─ chat (full page, or a side panel from "Ask the agent")
             └─ eve agent
                  ├─ main agent        everyday asks; hands the rest to a specialist
                  ├─ deals             coverage, scorecard, next steps
                  ├─ skills_and_plans  skills matrix, dev plans, career goals
                  ├─ talent            managers only: 9-box, retention, promotions, succession
                  └─ Friday digest     weekly schedule
             agent/lib/data.ts  ◄── one data layer, shared by pages and agent
                    │
                 Postgres (Neon)
```

Each specialist has its own instructions, tools and skills (`agent/subagents/<name>/`). Promotion cases run as a Workflow: gather evidence, score it, draft the case, then wait for the manager to approve or decline. Shout-outs are a Workflow too: announce, wait for the recipient to accept (up to 7 days), then record the win.

### Rendering and caching

Cache Components is on (`next.config.ts`), so every page is a partial prerender: the static shell comes from Vercel's CDN and the personal content streams from the function in Sydney (syd1, next to the Neon database).

| What | How it's cached | Cleared by |
| --- | --- | --- |
| Page shells (header, nav, headings, loading skeletons) | Prerendered, served from the CDN | A new deploy |
| Your own pages: Home, Achievements, Deals, Dev Plans, Skills | `"use cache: private"`, 60 seconds, in your browser only | Any button that changes data (`revalidatePath`), each chat turn, a reload |
| AI Usage | `"use cache: private"`, 5 minutes, so going back and forth doesn't re-run the billed Gateway reports | Saving a budget, a reload |
| Weekly digest | `"use cache: remote"` (Runtime Cache, one copy for all instances), hourly | `updateTag("digest")` after each chat turn |
| Team roster, Skills Matrix, selected model | `"use cache: remote"` in `lib/cached.ts`: hourly, every minute, hourly | `updateTag` after each chat turn (roster, skills) or on saving the model |
| Talent (9-box, retention, succession) and Settings | Never cached | |

Personal data is only ever cached in the person's own browser. Shared caches hold only what everyone may see. Agent tools read Postgres directly.

### Security: individual input vs management eyes only

The dashboard and the agent share one signed sign-in cookie, so they always agree on who is asking. Each rule is checked in more than one place:

1. **Pages**: SAs don't see the Talent tab, and the page refuses them if they type the URL.
2. **Tools**: manager-only tools are blocked for SAs, and sensitive changes ask the user to confirm first.
3. **Data**: every database read and write checks who is asking. SAs only see their own wins, plans and deals, and talent data is managers only. The weekly digest can't read talent data.
4. **The agent**: it has no shell, file or web access, only the tools above. If it can't tell who is asking, it refuses.
5. **Specialists**: they act with the user's own access. The talent specialist isn't loaded at all for SAs, the digest or shared Slack channels.

The demo sign-in stands in for SSO; swapping in Okta or Sign in with Vercel only changes how the cookie is issued.

### Reliability and cost

- A retried step can't log the same win or save the same promotion case twice.
- A promotion case can wait days for the manager's decision without holding anything open.
- AI Gateway switches to a second provider if the first is down, tags spend by feature and person, and each chat has a $1 cost cap.
- The AI Usage page reads Gateway's spend reports and compares this month with a budget set on Settings. The budget is a target for the page; a hard stop is an AI Gateway budget in the Vercel dashboard.
