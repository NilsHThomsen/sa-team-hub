import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth, isManager } from "../lib/actor";
import { findPerson, listAchievements, listCareerGoals, listDevPlans, listRetentionRisks, skillsMatrix } from "../lib/data";
import { skillLevelName } from "../lib/skill-levels";

export default defineTool({
  description:
    "Get one person's profile: skills matrix entries, and (if the user may see them) their achievements from the last 12 months, " +
    "career goal, every development plan and next step (a person can have several), and, for managers only, retention risk. ICs can see a colleague's skills but not their achievements, plan or risk.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Person id (e.g. 'priya-nair') or name"),
  }),
  label: { start: ({ person }) => `Open profile for ${person}` },
  async execute({ person }, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    const found = await findPerson(person);
    if (!found) throw new Error(`No one called "${person}" is on the team.`);

    const skills = (await skillsMatrix())
      .filter((s) => s.person_id === found.id)
      .map(({ category, name, level, status, completed_on, due_on }) => ({
        category, name, level: category === "product" ? skillLevelName(level) : undefined, status, completed_on, due_on,
      }));

    const self = actor.kind === "user" && actor.personId === found.id;
    if (!self && !isManager(actor)) {
      // Deliberately partial: skills are team-visible, the rest is private.
      return { person: found, skills, private: "Achievements, career goal, development plan and retention risk are visible only to this person and their manager." };
    }

    const [achievements, goals, plans, risks] = await Promise.all([
      listAchievements(actor, { personId: found.id }),
      listCareerGoals(actor),
      listDevPlans(actor),
      isManager(actor) ? listRetentionRisks(actor) : Promise.resolve([]),
    ]);
    return {
      person: found,
      skills,
      achievements: achievements.map(({ occurred_on, category, title, impact }) => ({ occurred_on, category, title, impact })),
      careerGoal: goals.find((g) => g.person_id === found.id) ?? null,
      devPlans: plans.filter((p) => p.person_id === found.id).map(({ goal, target_level, next_step, due_on, status, overdue }) => ({ goal, target_level, next_step, due_on, status, overdue })),
      retentionRisk: risks.find((r) => r.person_id === found.id) ?? undefined,
    };
  },
});
