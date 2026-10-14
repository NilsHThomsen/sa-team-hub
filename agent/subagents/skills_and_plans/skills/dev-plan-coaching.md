---
description: Use when writing, reviewing or improving someone's development plan, or advising what they should work on to reach their next level or career goal.
---

# Development plan coaching

Use this when someone asks for a development plan, wants theirs reviewed, or asks "what should I work on to get to Senior or Principal?".

1. Get the facts with `get_person_profile`: level, career goal, skills, certifications, soft skills, current plan and recent achievements. Use `find_skill_gaps` if the team's needs should shape the plan.
2. Check the goal. A plan should move them towards their career goal. If there is no goal, suggest setting one first (`update_career_goal`).
3. Compare them with the next level in the SA career framework and find the two or three biggest gaps:
   - **SA2:** 12+ months; runs customer engagements on their own (2+ customer wins); can present 4 product areas (Present or above).
   - **Senior SA (SSA):** leads complex POVs to technical wins (3+ customer wins); can demo 3 areas (Demo or above); a hyperscaler certification; contributes to pipeline through workshops or account days.
   - **Principal SA (PSA):** owns strategic technical wins; can prove 2+ areas in a customer POC (Prove); multiplies the team through enablement or mentoring; has completed Champion Building and Value Engineering (PSD).
   For a non-SA goal (Manager, Product Manager, Developer Relations, Sales), focus on the experiences that role needs, such as leading the team meeting, a product feedback programme or community talks.
4. Write the plan:
   - **Goal:** one sentence tied to the target level or role.
   - **Next step:** one concrete action they can start this month. Use a Next focus item if they have one.
   - **Due date:** only the user's date, or ask for one.
   - Add at most two follow-on actions in your reply; the plan itself holds only the next step.
5. Prefer real work over courses: pairing on a live POC, owning a workshop, presenting at the field call. Suggest a colleague to pair with only when the skills data shows they have the skill.
6. Offer to save it with `update_dev_plan`, and to mark any new focus skill as Next focus with `update_skill`. Both ask the user to confirm.

Keep it short and encouraging. Never compare the person with named colleagues.
