import { generateText, Output } from "ai";
import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { db } from "../lib/db";
import { type Evidence, type Level, NEXT_LEVEL, scoreAgainst } from "../lib/framework";
import { gatewayOptions, primaryModel } from "../lib/models";
import { managerOnly } from "../lib/policies";

// Why a workflow tool and not a plain tool: drafting a case is several steps,
// one of them a model call that can fail, and it ends by waiting for a manager
// to approve. That wait can be minutes or days. With the Workflow SDK each
// "use step" result is checkpointed, so a crash, timeout or redeploy resumes
// after the last finished step, and the approval wait holds no compute.

const caseSchema = z.object({
  headline: z.string().describe("One sentence: who, target level, and the core reason"),
  strengths: z.array(z.object({ criterion: z.string(), evidence: z.string() })).describe("Criteria met, each backed by a specific achievement or skill"),
  gaps: z.array(z.object({ criterion: z.string(), plan: z.string() })).describe("Criteria not yet met and how to close each before the cycle"),
  recommendation: z.enum(["ready", "ready_with_development", "not_yet"]),
  managerNotes: z.string().describe("Two or three sentences the manager can say in the calibration meeting"),
});

export default defineWorkflowTool({
  description:
    "Draft a promotion case for one person to their next level. Gathers their achievements, skills and development plan, " +
    "scores them against the SA career framework, drafts the case with a model, then asks the manager to approve it before saving. " +
    "Managers only. If the target level is omitted, the next level up is used.",
  inputSchema: z.object({
    personId: z.string().min(1).describe("Person id, e.g. 'priya-nair'. Resolve names with get_team_directory first."),
    targetLevel: z.enum(["SA2", "SSA", "PSA"]).optional(),
  }),
  approval: managerOnly, // ICs are refused before the workflow even starts
  label: { start: ({ personId }) => `Draft promotion case for ${personId}` },
  async *execute({ personId, targetLevel }, ctx) {
    "use workflow";

    yield { phase: "Gathering achievements, skills and development plan" };
    const evidence = await gatherEvidence(personId);
    const level = (targetLevel ?? NEXT_LEVEL[evidence.person.level]) as Level | undefined;
    if (!level) return { saved: false, reason: `${evidence.person.name} is already at the top of the IC framework.` };

    yield { phase: `Scoring against the ${level} framework` };
    const score = await scoreEvidence(level, evidence);

    yield { phase: "Drafting the case" };
    const draft = await draftCase(evidence, score);

    const caseId = await saveCase({
      personId,
      level,
      draft,
      createdBy: ctx.session.auth.current?.principalId ?? "unknown",
      callId: ctx.callId,
    });

    // Durable human-in-the-loop: the run parks here until the manager answers.
    yield { phase: "Waiting for manager approval" };
    const answer = await ctx.ask({
      display: "confirmation",
      prompt:
        `Promotion case for ${evidence.person.name} to ${level}: ${draft.case.recommendation.replaceAll("_", " ")} ` +
        `(${score.met}/${score.total} criteria met).\n\n${draft.case.headline}\n\nApprove and save it to the Talent page?`,
      options: [
        { id: "approve", label: "Approve case", style: "primary" },
        { id: "reject", label: "Send back" },
      ],
    });

    const approved = answer.status === "answered" && answer.optionId === "approve";
    const decidedBy = answer.status === "answered" ? (answer.responder?.principalId ?? null) : null;
    await decideCase(caseId, approved ? "approved" : "rejected", decidedBy);

    return {
      saved: true,
      caseId,
      status: approved ? "approved" : "rejected",
      person: evidence.person.name,
      targetLevel: level,
      criteriaMet: `${score.met}/${score.total}`,
      modelUsed: draft.modelUsed,
      case: draft.case,
    };
  },
});

// ---------- Steps: side effects live here, the workflow body stays deterministic ----------

async function gatherEvidence(personId: string): Promise<Evidence> {
  "use step";
  const sql = db();
  const [person] = await sql<Evidence["person"][]>`
    select id, name, level, title, to_char(start_date, 'YYYY-MM-DD') as start_date from people where id = ${personId}`;
  if (!person) throw new Error(`No person with id "${personId}".`);
  const [skills, achievements, plans] = await Promise.all([
    sql<Evidence["skills"]>`select category, name, level, status from skills where person_id = ${personId}`,
    sql<Evidence["achievements"]>`
      select to_char(occurred_on, 'YYYY-MM-DD') as occurred_on, category, title, impact
      from achievements where person_id = ${personId} and occurred_on >= current_date - 365 order by occurred_on desc`,
    sql<NonNullable<Evidence["devPlan"]>[]>`
      select goal, target_level, status, (status <> 'done' and due_on < current_date) as overdue
      from dev_plans where person_id = ${personId} order by updated_at desc limit 1`,
  ]);
  const tenureMonths = Math.floor((Date.now() - Date.parse(person.start_date)) / (1000 * 60 * 60 * 24 * 30.4));
  return { person, tenureMonths, skills: [...skills], achievements: [...achievements], devPlan: plans[0] ?? null };
}

async function scoreEvidence(level: Level, evidence: Evidence) {
  "use step";
  return scoreAgainst(level, evidence);
}

async function draftCase(evidence: Evidence, score: ReturnType<typeof scoreAgainst>) {
  "use step";
  // AI SDK structured output: the model must return an object matching caseSchema,
  // so the dashboard and the approval prompt never parse free text.
  const model = await primaryModel();
  const result = await generateText({
    model,
    providerOptions: gatewayOptions("promotion-case", model),
    output: Output.object({ schema: caseSchema }),
    instructions:
      "You write promotion cases for a presales (Solutions Architect) team. Use only the evidence provided. " +
      "Never invent achievements, numbers or customers. Be specific and concise. Australian English.",
    prompt: JSON.stringify({ person: evidence.person, tenureMonths: evidence.tenureMonths, framework: score, achievements: evidence.achievements, devPlan: evidence.devPlan }),
    maxRetries: 2,
  });
  return { case: result.output, modelUsed: result.response.modelId };
}

async function saveCase(input: { personId: string; level: Level; draft: Awaited<ReturnType<typeof draftCase>>; createdBy: string; callId: string }) {
  "use step";
  // workflow_call is unique, so if this step is retried the case is written once.
  const [row] = await db()<{ id: number }[]>`
    insert into promotion_cases (person_id, target_level, status, summary, case_json, model_used, created_by, workflow_call)
    values (${input.personId}, ${input.level}, 'pending_approval', ${input.draft.case.headline},
            ${db().json(input.draft.case)}, ${input.draft.modelUsed}, ${input.createdBy}, ${input.callId})
    on conflict (workflow_call) do update set summary = excluded.summary
    returning id`;
  return row.id;
}

async function decideCase(caseId: number, status: "approved" | "rejected", decidedBy: string | null) {
  "use step";
  await db()`update promotion_cases set status = ${status}, decided_by = ${decidedBy}, decided_at = now() where id = ${caseId}`;
}
