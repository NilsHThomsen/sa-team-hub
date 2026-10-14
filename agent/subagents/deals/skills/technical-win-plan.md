---
description: Use when asked to review a deal, plan how to win it technically, or decide the SA's next move on an opportunity.
---

# Technical win plan

Use this when someone asks "how do we win X?", "review this deal" or "what should the SA do next on X?". It turns one deal's data into a short, specific plan.

1. Get the facts first with `review_deal_coverage` (onlyFlagged false). Find the deal, its flags, and, if it is in this quarter's Top 5, its scorecard (deliverables done, SA comment, score).
2. Say where it stands in one line: account, ACV, close quarter, sales stage, presales stage and forecast. Call out any flag (no SA, stale next step, no technical win at stage 3+, presales and forecast out of line).
3. Work out the next deliverable. The presales path is Presentation, then Demo, then POC, then InfoSec review. Suggest the first one not done, unless the deal is small or late enough that a step can sensibly be skipped; say why if so.
   - Discovery: aim for a tailored presentation and an agreed set of use cases.
   - Solution design: a demo on the customer's own scenario and written success criteria.
   - Technical validation: a time-boxed POC against those criteria, and book the InfoSec review in parallel so it doesn't become the last blocker.
   - Tech win: confirm it in writing, close any InfoSec gap, and hand the AE the evidence to move the forecast to Strong Upside or Commit.
4. Name the risks, at most three: a missing champion, a security or procurement blocker, a competitor, or an SA carrying too many deals. Only use risks the data or the user supports.
5. End with one concrete next step: an owner, an action and, only if the user gave one, a date. Offer to save it with `update_deal_next_step`, and to tick off finished deliverables with `update_deal_scorecard`. Both ask the user to confirm.

Keep it under ten lines. Never invent customer names, numbers or dates.
