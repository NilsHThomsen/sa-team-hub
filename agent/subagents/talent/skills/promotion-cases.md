---
description: How to discuss promotion readiness and present a drafted promotion case to a manager.
---

# Promotion cases

Use this when a manager asks whether someone is ready for promotion, or after `draft_promotion_case` returns.

1. Lead with the recommendation and the criteria score, for example "Ready with development: 4 of 5 PSA criteria met".
2. List the strongest two or three pieces of evidence, each tied to a criterion.
3. For each gap, give one concrete action and a date before the next promotion cycle (mid-year).
4. Report the decision from the tool's `decision` field. "Approved" there means the manager answered the confirmation question themselves, so say it is approved and saved; never suggest it was approved without them. Approving saves the case as written, even when its recommendation is "not yet".
5. If the case was declined, ask what the manager wants changed and offer to redraft.
6. Never compare the person with named colleagues, and never mention retention risk in the case itself.

Framework summary (the authoritative rules live in code, `agent/lib/framework.ts`):

- **SA2:** 12+ months, independent customer engagements, can present 4 product areas (Present level).
- **Senior SA (SSA):** leads complex POVs to technical wins, can demo 3 areas (Demo level), a hyperscaler certification, contributes to pipeline.
- **Principal SA (PSA):** owns strategic wins, can prove 2+ areas in a customer POC (Prove level), multiplies the team through enablement and mentoring, has completed Champion Building and Value Engineering.
