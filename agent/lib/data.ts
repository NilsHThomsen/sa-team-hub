import { db } from "./db";
import { AccessDenied, type Actor, isManager, requireManager } from "./actor";
import { fiscalQuarter } from "./fiscal";
import { type CareerGoal, isCareerGoal } from "./career-goals";
import { DEFAULT_MODEL, isModelId, type ModelId } from "./models";
import { skillLevelName } from "./skill-levels";

// All reads and writes go through these functions, for the dashboard pages and
// the agent's tools alike. Access rules live here, next to the SQL, so a new
// page or a new tool cannot forget them:
//   - Directory, skills matrix and deals are team-visible (people need to find
//     who knows what, and deals are worked as a team).
//   - Achievements and development plans: ICs see and write only their own.
//   - Retention, succession, warm bench and promotion cases: managers only.

export interface Person {
  id: string;
  name: string;
  title: string;
  level: string;
  role: "ic" | "manager";
  segment: string;
  location: string;
  start_date: string;
}

function canSeePerson(actor: Actor, personId: string): boolean {
  if (actor.kind === "app") return true; // team-level summaries for the digest
  return actor.role === "manager" || actor.personId === personId;
}

function assertCanSeePerson(actor: Actor, personId: string, what: string): void {
  if (!canSeePerson(actor, personId)) {
    throw new AccessDenied(`You can only see your own ${what}.`);
  }
}

// ---------- Directory ----------

export async function listPeople(): Promise<Person[]> {
  return db()<Person[]>`
    select id, name, title, level, role, segment, location, to_char(start_date, 'YYYY-MM-DD') as start_date
    from people order by role desc, name`;
}

/** Finds a person by id or by (part of) their name. */
export async function findPerson(query: string): Promise<Person | null> {
  const rows = await db()<Person[]>`
    select id, name, title, level, role, segment, location, to_char(start_date, 'YYYY-MM-DD') as start_date
    from people
    where id = ${query} or name ilike ${"%" + query + "%"}
    order by (id = ${query}) desc, name
    limit 2`;
  if (rows.length === 0) return null;
  if (rows.length > 1 && rows[0].id !== query) {
    throw new Error(`"${query}" matches more than one person (${rows.map((r) => r.name).join(", ")}). Be more specific.`);
  }
  return rows[0];
}

// ---------- Skills matrix ----------

export interface SkillRow {
  person_id: string;
  category: "product" | "certification" | "enablement";
  name: string;
  level: number | null;
  status: "not_started" | "next_focus" | "in_progress" | "complete" | null;
  completed_on: string | null;
  due_on: string | null;
}

export async function skillsMatrix(): Promise<SkillRow[]> {
  return db()<SkillRow[]>`
    select person_id, category, name, level, status,
           to_char(completed_on, 'YYYY-MM-DD') as completed_on,
           to_char(due_on, 'YYYY-MM-DD') as due_on
    from skills order by category, name, person_id`;
}

export interface SkillGap {
  category: string;
  name: string;
  reason: string;
  needed: number;
  have: number;
  short_by: number;
  qualified: string[];
  min_level?: string; // product skills: the level that counts, e.g. "Demo"
  closest: string[]; // people one step away (level one below, or in progress)
}

/**
 * Compares the team against next quarter's needs (skill_needs).
 * Managers see names; ICs see the team totals plus their own position, so the
 * tool is useful to everyone without exposing a colleague's development gaps.
 */
export async function skillGaps(actor: Actor): Promise<{ gaps: SkillGap[]; myGaps?: string[] }> {
  const needs = await db()<{ category: string; name: string; min_level: number | null; min_people: number; reason: string }[]>`
    select category, name, min_level, min_people, reason from skill_needs order by category, name`;
  const rows = await db()<(SkillRow & { person_name: string })[]>`
    select s.person_id, s.category, s.name, s.level, s.status, p.name as person_name
    from skills s join people p on p.id = s.person_id where p.role = 'ic'`;

  const showNames = isManager(actor);
  const gaps: SkillGap[] = [];
  const myGaps: string[] = [];

  for (const need of needs) {
    const matching = rows.filter((r) => r.category === need.category && r.name === need.name);
    const meets = (r: SkillRow) =>
      need.category === "product" ? (r.level ?? 0) >= (need.min_level ?? 0) : r.status === "complete";
    const close = (r: SkillRow) =>
      need.category === "product" ? (r.level ?? 0) === (need.min_level ?? 0) - 1 : r.status === "in_progress";

    const qualified = matching.filter(meets);
    const closest = matching.filter(close);
    gaps.push({
      category: need.category,
      name: need.name,
      reason: need.reason,
      min_level: need.category === "product" ? skillLevelName(need.min_level) : undefined,
      needed: need.min_people,
      have: qualified.length,
      short_by: Math.max(0, need.min_people - qualified.length),
      qualified: showNames ? qualified.map((r) => r.person_name) : [],
      closest: showNames ? closest.map((r) => r.person_name) : [],
    });

    if (actor.kind === "user" && actor.role === "ic") {
      const mine = matching.find((r) => r.person_id === actor.personId);
      if (!mine || !meets(mine)) myGaps.push(need.name);
    }
  }

  return actor.kind === "user" && actor.role === "ic" ? { gaps, myGaps } : { gaps };
}

// ---------- Achievements ----------

export interface Achievement {
  id: number;
  person_id: string;
  person_name: string;
  occurred_on: string;
  category: string;
  title: string;
  impact: string;
  logged_by: string;
}

export async function listAchievements(actor: Actor, opts: { personId?: string; days?: number } = {}): Promise<Achievement[]> {
  // ICs are always scoped to themselves, whatever they ask for.
  const personId = actor.kind === "user" && actor.role === "ic" ? actor.personId : opts.personId;
  if (opts.personId) assertCanSeePerson(actor, opts.personId, "achievements");
  const days = opts.days ?? 365;
  return db()<Achievement[]>`
    select a.id, a.person_id, p.name as person_name, to_char(a.occurred_on, 'YYYY-MM-DD') as occurred_on,
           a.category, a.title, a.impact, a.logged_by
    from achievements a join people p on p.id = a.person_id
    where (${personId ?? null}::text is null or a.person_id = ${personId ?? null})
      and a.occurred_on >= current_date - ${days}::int
    order by a.occurred_on desc, a.id desc`;
}

export async function addAchievement(
  actor: Actor,
  input: { personId: string; occurredOn: string; category: string; title: string; impact: string },
  idempotencyKey: string,
): Promise<{ id: number; duplicate: boolean }> {
  if (actor.kind !== "user") throw new AccessDenied("Only a signed-in person can log achievements.");
  if (actor.role === "ic" && input.personId !== actor.personId) {
    throw new AccessDenied("ICs can log achievements for themselves only. Ask your manager to log it for a colleague.");
  }
  // The idempotency key is the tool call id: if eve replays an interrupted step,
  // the insert hits the unique constraint and we return the existing row.
  const inserted = await db()<{ id: number }[]>`
    insert into achievements (person_id, occurred_on, category, title, impact, logged_by, idempotency_key)
    values (${input.personId}, ${input.occurredOn}, ${input.category}, ${input.title}, ${input.impact}, ${actor.personId}, ${idempotencyKey})
    on conflict (idempotency_key) do nothing
    returning id`;
  if (inserted.length > 0) return { id: inserted[0].id, duplicate: false };
  const [existing] = await db()<{ id: number }[]>`select id from achievements where idempotency_key = ${idempotencyKey}`;
  return { id: existing.id, duplicate: true };
}

// ---------- Shout-outs ----------
// One teammate recognises another. It only reaches the recipient's achievements
// doc once they accept it, so nobody's record changes without their say.

export const SHOUTOUT_CATEGORIES = ["customer", "pipeline", "enablement", "community", "leadership"] as const;

export interface Shoutout {
  id: number;
  from_person: string;
  from_name: string;
  to_person: string;
  to_name: string;
  category: string;
  title: string;
  message: string;
  status: "pending" | "accepted" | "declined" | "expired";
  created_at: string;
  webhook_url: string | null;
}

function selectShoutouts(sql: ReturnType<typeof db>) {
  return sql`
    select s.id, s.from_person, f.name as from_name, s.to_person, t.name as to_name, s.category, s.title, s.message,
           s.status, to_char(s.created_at, 'YYYY-MM-DD') as created_at, s.webhook_url
    from shoutouts s join people f on f.id = s.from_person join people t on t.id = s.to_person`;
}

export async function createShoutout(
  actor: Actor,
  input: { toPersonId: string; category: string; title: string; message: string },
  idempotencyKey: string,
): Promise<Shoutout> {
  if (actor.kind !== "user") throw new AccessDenied("Only a signed-in person can send a shout-out.");
  if (input.toPersonId === actor.personId) throw new AccessDenied("Shout-outs are for recognising someone else. Log your own wins as achievements.");
  const sql = db();
  await sql`
    insert into shoutouts (from_person, to_person, category, title, message, idempotency_key)
    values (${actor.personId}, ${input.toPersonId}, ${input.category}, ${input.title}, ${input.message}, ${idempotencyKey})
    on conflict (idempotency_key) do nothing`;
  const [row] = await sql<Shoutout[]>`
    ${selectShoutouts(sql)}
    where s.idempotency_key = ${idempotencyKey}`;
  return row;
}

export async function getShoutout(id: number): Promise<Shoutout | null> {
  const sql = db();
  const [row] = await sql<Shoutout[]>`
    ${selectShoutouts(sql)}
    where s.id = ${id}`;
  return row ?? null;
}

export async function setShoutoutWebhook(id: number, url: string): Promise<void> {
  await db()`update shoutouts set webhook_url = ${url} where id = ${id}`;
}

/** Shout-outs waiting for this person's decision. Only the recipient sees them. */
export async function listPendingShoutoutsFor(actor: Actor): Promise<Shoutout[]> {
  if (actor.kind !== "user") return [];
  const sql = db();
  return sql<Shoutout[]>`
    ${selectShoutouts(sql)}
    where s.to_person = ${actor.personId} and s.status = 'pending' order by s.created_at`;
}

/** Shout-outs this person sent, newest first, so they can see who has answered. */
export async function listSentShoutouts(actor: Actor): Promise<Shoutout[]> {
  if (actor.kind !== "user") return [];
  const sql = db();
  return sql<Shoutout[]>`
    ${selectShoutouts(sql)}
    where s.from_person = ${actor.personId} order by s.created_at desc limit 20`;
}

/**
 * The recipient accepts or declines. Nobody else can, managers included: it is
 * the recipient's record. Returns the webhook to wake the waiting workflow.
 */
export async function decideShoutout(actor: Actor, id: number, accept: boolean): Promise<{ status: Shoutout["status"]; webhookUrl: string | null }> {
  if (actor.kind !== "user") throw new AccessDenied("Only the recipient can answer a shout-out.");
  const shoutout = await getShoutout(id);
  if (!shoutout || shoutout.to_person !== actor.personId) throw new AccessDenied("Only the recipient can answer a shout-out.");
  if (shoutout.status !== "pending") return { status: shoutout.status, webhookUrl: null };
  const status = accept ? "accepted" : "declined";
  await db()`update shoutouts set status = ${status}, decided_at = now() where id = ${id} and status = 'pending'`;
  return { status, webhookUrl: shoutout.webhook_url };
}

/**
 * Called by the workflow once the recipient has accepted. Writes the achievement
 * with the sender as `logged_by`; keyed on the shout-out so a replay writes once.
 */
export async function recordAcceptedShoutout(id: number): Promise<{ achievementId: number } | null> {
  const sql = db();
  const shoutout = await getShoutout(id);
  if (!shoutout || shoutout.status !== "accepted") return null;
  const key = `shoutout:${id}`;
  await sql`
    insert into achievements (person_id, occurred_on, category, title, impact, logged_by, idempotency_key)
    values (${shoutout.to_person}, ${shoutout.created_at}, ${shoutout.category},
            ${`Shout-out from ${shoutout.from_name}: ${shoutout.title}`}, ${shoutout.message}, ${shoutout.from_person}, ${key})
    on conflict (idempotency_key) do nothing`;
  const [row] = await sql<{ id: number }[]>`select id from achievements where idempotency_key = ${key}`;
  await sql`update shoutouts set achievement_id = ${row.id} where id = ${id}`;
  return { achievementId: row.id };
}

export async function expireShoutout(id: number): Promise<void> {
  await db()`update shoutouts set status = 'expired', decided_at = now() where id = ${id} and status = 'pending'`;
}

// ---------- Development plans ----------

export interface DevPlan {
  id: number;
  person_id: string;
  person_name: string;
  goal: string;
  target_level: string;
  next_step: string;
  due_on: string;
  status: "on_track" | "at_risk" | "done";
  overdue: boolean;
}

export async function listDevPlans(actor: Actor): Promise<DevPlan[]> {
  const personId = actor.kind === "user" && actor.role === "ic" ? actor.personId : null;
  return db()<DevPlan[]>`
    select d.id, d.person_id, p.name as person_name, d.goal, d.target_level, d.next_step,
           to_char(d.due_on, 'YYYY-MM-DD') as due_on, d.status,
           (d.status <> 'done' and d.due_on < current_date) as overdue
    from dev_plans d join people p on p.id = d.person_id
    where (${personId}::text is null or d.person_id = ${personId})
    order by overdue desc, d.due_on`;
}

// ---------- Career goals ----------

export interface CareerGoalRow {
  person_id: string;
  person_name: string;
  goal: CareerGoal | null;
  note: string;
  updated_by_name: string | null;
  updated_at: string | null;
}

/** One row per IC (or just yourself, for an IC), with their career goal if they have set one. */
export async function listCareerGoals(actor: Actor): Promise<CareerGoalRow[]> {
  const personId = actor.kind === "user" && actor.role === "ic" ? actor.personId : null;
  return db()<CareerGoalRow[]>`
    select p.id as person_id, p.name as person_name, g.goal, coalesce(g.note, '') as note,
           u.name as updated_by_name, to_char(g.updated_at, 'YYYY-MM-DD') as updated_at
    from people p
    left join career_goals g on g.person_id = p.id
    left join people u on u.id = g.updated_by
    where p.role = 'ic' and (${personId}::text is null or p.id = ${personId})
    order by p.name`;
}

/**
 * Set a person's career goal. ICs can change only their own; managers can change anyone's.
 * An upsert keyed on person_id, so replaying the same change leaves the same state.
 */
export async function setCareerGoal(actor: Actor, input: { personId: string; goal: string; note?: string }): Promise<CareerGoalRow> {
  if (actor.kind !== "user") throw new AccessDenied("Career goals are changed by a signed-in person.");
  assertCanSeePerson(actor, input.personId, "career goal");
  if (!isCareerGoal(input.goal)) throw new Error(`"${input.goal}" is not a career goal option.`);
  const [target] = await db()<{ role: string }[]>`select role from people where id = ${input.personId}`;
  if (target?.role !== "ic") throw new Error("Career goals are tracked for SAs on the team.");
  await db()`
    insert into career_goals (person_id, goal, note, updated_by, updated_at)
    values (${input.personId}, ${input.goal}, ${input.note ?? ""}, ${actor.personId}, now())
    on conflict (person_id) do update
      set goal = excluded.goal,
          note = case when ${input.note === undefined} then career_goals.note else excluded.note end,
          updated_by = excluded.updated_by, updated_at = now()`;
  const [row] = (await listCareerGoals(actor)).filter((g) => g.person_id === input.personId);
  return row;
}

// ---------- Settings ----------

export interface ModelSetting {
  model: ModelId;
  updated_by_name: string | null;
  updated_at: string | null;
}

/** The primary model and who chose it. Managers only, like the page that shows it. */
export async function getModelSetting(actor: Actor): Promise<ModelSetting> {
  requireManager(actor, "Model settings");
  const [row] = await db()<{ value: string; updated_by_name: string | null; updated_at: string }[]>`
    select s.value, p.name as updated_by_name, to_char(s.updated_at, 'YYYY-MM-DD HH24:MI') as updated_at
    from app_settings s left join people p on p.id = s.updated_by
    where s.key = 'primary_model'`;
  if (!row || !isModelId(row.value)) return { model: DEFAULT_MODEL, updated_by_name: null, updated_at: null };
  return { model: row.value, updated_by_name: row.updated_by_name, updated_at: row.updated_at };
}

/** Choose the primary model for new chats, the digest and promotion cases. Managers only. */
export async function setPrimaryModel(actor: Actor, model: string): Promise<ModelSetting> {
  requireManager(actor, "Model settings");
  if (actor.kind !== "user") throw new AccessDenied("Model settings need a signed-in manager.");
  if (!isModelId(model)) throw new Error(`"${model}" is not one of the models on offer.`);
  await db()`
    insert into app_settings (key, value, updated_by, updated_at)
    values ('primary_model', ${model}, ${actor.personId}, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
  return getModelSetting(actor);
}

// ---------- AI spend budget ----------

const BUDGET_KEY = "monthly_budget_usd";
/** Used until a manager sets a budget on the Settings page, and again after they clear it. */
export const DEFAULT_MONTHLY_BUDGET = 100;

/** The monthly AI spend target in US dollars: the one set on the Settings page, else the default. Managers only. */
export async function getMonthlyBudget(actor: Actor): Promise<number> {
  requireManager(actor, "The AI budget");
  const [row] = await db()<{ value: string }[]>`select value from app_settings where key = ${BUDGET_KEY}`;
  const value = row ? Number(row.value) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MONTHLY_BUDGET;
}

/**
 * Set the monthly AI spend target, or go back to the default with an empty value. Managers only.
 * It's our own number for the AI Usage page: Gateway's reporting API doesn't return
 * the budget set in the Vercel dashboard, and this doesn't change that budget.
 */
export async function setMonthlyBudget(actor: Actor, input: string): Promise<number> {
  requireManager(actor, "The AI budget");
  if (actor.kind !== "user") throw new AccessDenied("The AI budget needs a signed-in manager.");
  const text = input.trim().replace(/^(US)?\$/i, "").replaceAll(",", "");
  if (!text) {
    await db()`delete from app_settings where key = ${BUDGET_KEY}`;
    return DEFAULT_MONTHLY_BUDGET;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) throw new Error("Enter the budget in US dollars, for example 100.");
  await db()`
    insert into app_settings (key, value, updated_by, updated_at)
    values (${BUDGET_KEY}, ${String(value)}, ${actor.personId}, now())
    on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`;
  return value;
}

/** Promotion cases drafted between two UTC dates (inclusive), optionally by one manager. For cost per case on AI Usage. Managers only. */
export async function countPromotionCases(actor: Actor, from: string, to: string, createdBy?: string): Promise<number> {
  requireManager(actor, "Promotion cases");
  const [row] = await db()<{ n: number }[]>`
    select count(*)::int as n from promotion_cases
    where created_at >= ${from}::date and created_at < ${to}::date + 1
      and (${createdBy ?? null}::text is null or created_by = ${createdBy ?? null})`;
  return row?.n ?? 0;
}

// ---------- Slack links ----------

const SLACK_ID = /^[UW][A-Z0-9]{6,}$/;

/** Who a Slack member is on the team, or null. Used by the Slack channel before any turn starts. */
export async function findPersonBySlackId(slackUserId: string): Promise<Person | null> {
  const [row] = await db()<Person[]>`
    select id, name, title, level, role, segment, location, to_char(start_date, 'YYYY-MM-DD') as start_date
    from people where slack_user_id = ${slackUserId}`;
  return row ?? null;
}

export async function listSlackLinks(actor: Actor) {
  requireManager(actor, "Slack links");
  return db()<{ id: string; name: string; role: string; slack_user_id: string | null }[]>`
    select id, name, role, slack_user_id from people order by role desc, name`;
}

/** Link (or with an empty id, unlink) a person's Slack account. Managers only. */
export async function setSlackLink(actor: Actor, personId: string, slackUserId: string): Promise<void> {
  requireManager(actor, "Slack links");
  const id = slackUserId.trim().toUpperCase();
  if (id && !SLACK_ID.test(id)) throw new Error("That doesn't look like a Slack member ID (it starts with U, like U0123ABCD).");
  await db()`update people set slack_user_id = ${id || null} where id = ${personId}`;
}

// ---------- Deal coverage ----------

export const PRESALES_STAGES = ["discovery", "solution_design", "technical_validation", "tech_win"] as const;
export type PresalesStage = (typeof PRESALES_STAGES)[number];
export const FORECASTS = ["pipeline", "upside", "strong_upside", "commit", "closed"] as const;
export type Forecast = (typeof FORECASTS)[number];
export const LABEL: Record<PresalesStage | Forecast, string> = {
  discovery: "Discovery",
  solution_design: "Solution design",
  technical_validation: "Technical validation",
  tech_win: "Tech win",
  pipeline: "Pipeline",
  upside: "Upside",
  strong_upside: "Strong Upside",
  commit: "Commit",
  closed: "Closed",
};

/**
 * Presales and sales should tell the same story. A tech win the sales forecast
 * still calls Pipeline or Upside is under-called; a Commit with no tech win is
 * over-called. Either one is a conversation for the deal review.
 */
export function alignmentFlag(presales: PresalesStage, forecast: Forecast): string | null {
  if (presales === "tech_win" && (forecast === "pipeline" || forecast === "upside")) {
    return `tech win but forecast is only ${LABEL[forecast]} (should be Strong Upside or Commit)`;
  }
  if (forecast === "commit" && presales !== "tech_win") {
    return `in Commit without a tech win (presales stage: ${LABEL[presales]})`;
  }
  return null;
}

export const DEAL_DELIVERABLES = ["presentation", "demo", "poc", "infosec_review"] as const;
export type DealDeliverable = (typeof DEAL_DELIVERABLES)[number];
export const DELIVERABLE_LABEL: Record<DealDeliverable, string> = { presentation: "Presentation", demo: "Demo", poc: "POC", infosec_review: "InfoSec review" };

export interface DealRow {
  id: string;
  account: string;
  ae: string;
  sa_id: string | null;
  sa_name: string | null;
  stage: number;
  acv_usd: number;
  close_quarter: string;
  next_step: string;
  next_step_on: string;
  days_since_update: number;
  presales_stage: PresalesStage;
  forecast: Forecast;
  deliverables: DealDeliverable[];
  sa_comment: string | null;
  flags: string[];
}

export const STALE_DAYS = 14;
const SA_DEAL_LIMIT = 3; // active stage 2-4 deals per SA before we call it overloaded

/** Applies the business plan's coverage rules to every open deal. */
export async function dealCoverage(actor: Actor): Promise<{ deals: DealRow[]; summary: ReturnType<typeof summarizeDeals> }> {
  const rows = await db()<Omit<DealRow, "flags">[]>`
    select d.id, d.account, d.ae, d.sa_id, p.name as sa_name, d.stage, d.acv_usd, d.close_quarter,
           d.next_step, to_char(d.next_step_on, 'YYYY-MM-DD') as next_step_on,
           (current_date - d.next_step_on)::int as days_since_update, d.presales_stage, d.forecast,
           d.deliverables, d.sa_comment
    from deals d left join people p on p.id = d.sa_id
    where d.stage < 5
    order by d.stage desc, d.acv_usd desc`;

  const load = new Map<string, number>();
  for (const r of rows) if (r.sa_id && r.stage >= 2) load.set(r.sa_id, (load.get(r.sa_id) ?? 0) + 1);

  const deals = rows.map((r) => {
    const flags: string[] = [];
    if (r.stage >= 2 && !r.sa_id) flags.push("no SA assigned");
    if (r.days_since_update > STALE_DAYS) flags.push(`next step ${r.days_since_update} days old`);
    if (r.stage >= 3 && r.presales_stage !== "tech_win") flags.push("no technical win yet");
    const misaligned = alignmentFlag(r.presales_stage, r.forecast);
    if (misaligned) flags.push(misaligned);
    if (r.sa_id && (load.get(r.sa_id) ?? 0) > SA_DEAL_LIMIT) flags.push(`${r.sa_name} is on ${load.get(r.sa_id)} active deals`);
    return { ...r, flags };
  });

  // ICs see the deals they cover; the team-wide summary numbers carry no names.
  const visible = actor.kind === "user" && actor.role === "ic" ? deals.filter((d) => d.sa_id === actor.personId) : deals;
  const summary = summarizeDeals(deals);
  return { deals: visible, summary };
}

/** The fiscal quarter deals close in this quarter, matching close_quarter ("FY27 Q3"). */
export function currentQuarter(now = new Date()): string {
  return fiscalQuarter(now);
}

const STAGE_POINTS: Record<PresalesStage, number> = { discovery: 0, solution_design: 10, technical_validation: 25, tech_win: 40 };

/** Deal score out of 100: 15 for each deliverable done, plus up to 40 for how far the SA stage has got. */
export function dealScore(deal: Pick<DealRow, "deliverables" | "presales_stage">): number {
  return deal.deliverables.length * 15 + STAGE_POINTS[deal.presales_stage];
}

/** The biggest open deals closing this quarter, by ACV. */
export function topDeals(deals: readonly DealRow[], count = 5, quarter = currentQuarter()): DealRow[] {
  return deals
    .filter((d) => d.close_quarter === quarter && d.stage < 5)
    .sort((a, b) => b.acv_usd - a.acv_usd)
    .slice(0, count);
}

/** Coverage numbers for a set of deals: the whole team, or one or more people's deals on a filtered page. */
export function summarizeDeals(deals: readonly DealRow[]) {
  const stage2plus = deals.filter((d) => d.stage >= 2);
  const s3 = deals.filter((d) => d.stage >= 3);
  return {
    open_deals: deals.length,
    stage2plus: stage2plus.length,
    stage2plus_covered_pct: stage2plus.length === 0 ? 100 : Math.round((100 * stage2plus.filter((d) => d.sa_id).length) / stage2plus.length),
    stale_next_steps: deals.filter((d) => d.days_since_update > STALE_DAYS).length,
    stage_misaligned: deals.filter((d) => alignmentFlag(d.presales_stage, d.forecast)).length,
    stage3plus_tech_win_pct: s3.length === 0 ? 100 : Math.round((100 * s3.filter((d) => d.presales_stage === "tech_win").length) / s3.length),
  };
}

/** Finds an open deal by id or account name. Errors if the name matches more than one. */
export async function findDeal(query: string): Promise<{ id: string; account: string; sa_id: string | null } | null> {
  const rows = await db()<{ id: string; account: string; sa_id: string | null }[]>`
    select id, account, sa_id from deals
    where stage < 5 and (id = ${query} or account ilike ${"%" + query + "%"})
    order by account`;
  // An exact id or account name wins over partial matches ("Harbour Bank" vs "Harbour Bank (Wealth)").
  const exact = rows.find((r) => r.id === query || r.account.toLowerCase() === query.toLowerCase());
  if (exact) return exact;
  if (rows.length > 1) throw new Error(`"${query}" matches ${rows.map((r) => r.account).join(", ")}. Which one?`);
  return rows[0] ?? null;
}

/**
 * Updates a deal's next step (and optionally its presales stage), the way an
 * SA would in the CRM. ICs can update only deals they cover; managers any deal.
 * The change is logged in deal_updates with the caller and the tool call id, so a
 * replayed step neither double-logs nor re-dates the next step.
 */
export async function updateDealNextStep(
  actor: Actor,
  input: { dealId: string; nextStep: string; presalesStage?: PresalesStage },
  idempotencyKey: string,
): Promise<{ deal_id: string; account: string; next_step: string; presales_stage: PresalesStage; forecast: Forecast; next_step_on: string; misaligned: string | null; duplicate: boolean }> {
  if (actor.kind !== "user") throw new AccessDenied("Only a signed-in person can update the CRM.");
  const sql = db();
  return sql.begin(async (tx) => {
    const [deal] = await tx<{ id: string; account: string; sa_id: string | null }[]>`
      select id, account, sa_id from deals where id = ${input.dealId} for update`;
    if (!deal) throw new Error(`No deal with id "${input.dealId}".`);
    if (actor.role === "ic" && deal.sa_id !== actor.personId) {
      throw new AccessDenied(`You can only update deals you cover. Ask the SA on ${deal.account} or your manager.`);
    }
    const logged = await tx`
      insert into deal_updates (deal_id, next_step, presales_stage, updated_by, idempotency_key)
      values (${deal.id}, ${input.nextStep}, ${input.presalesStage ?? null}, ${actor.personId}, ${idempotencyKey})
      on conflict (idempotency_key) do nothing
      returning id`;
    if (logged.length > 0) {
      await tx`
        update deals set next_step = ${input.nextStep}, next_step_on = current_date,
          presales_stage = coalesce(${input.presalesStage ?? null}::text, presales_stage)
        where id = ${deal.id}`;
    }
    const [row] = await tx<{ next_step: string; presales_stage: PresalesStage; forecast: Forecast; next_step_on: string }[]>`
      select next_step, presales_stage, forecast, to_char(next_step_on, 'YYYY-MM-DD') as next_step_on from deals where id = ${deal.id}`;
    // Tell the caller straight away if their update leaves presales and sales out of line.
    const misaligned = alignmentFlag(row.presales_stage, row.forecast);
    return { deal_id: deal.id, account: deal.account, ...row, misaligned, duplicate: logged.length === 0 };
  });
}

/**
 * Updates a deal's scorecard: deliverables to mark done or undo, and the SA's
 * comment. SAs update the deals they cover; managers any deal.
 */
export async function updateDealScorecard(
  actor: Actor,
  input: { dealId: string; done?: readonly DealDeliverable[]; undo?: readonly DealDeliverable[]; comment?: string },
): Promise<{ deal_id: string; account: string; deliverables: DealDeliverable[]; sa_comment: string | null; score: number }> {
  if (actor.kind !== "user") throw new AccessDenied("Only a signed-in person can update the CRM.");
  const sql = db();
  return sql.begin(async (tx) => {
    const [deal] = await tx<{ id: string; account: string; sa_id: string | null; deliverables: DealDeliverable[] }[]>`
      select id, account, sa_id, deliverables from deals where id = ${input.dealId} for update`;
    if (!deal) throw new Error(`No deal with id "${input.dealId}".`);
    if (actor.role === "ic" && deal.sa_id !== actor.personId) {
      throw new AccessDenied(`You can only update deals you cover. Ask the SA on ${deal.account} or your manager.`);
    }
    // Keep the canonical order so the scorecard always reads Presentation, Demo, POC, InfoSec review.
    const next = new Set<DealDeliverable>(deal.deliverables);
    for (const d of input.done ?? []) next.add(d);
    for (const d of input.undo ?? []) next.delete(d);
    const deliverables = DEAL_DELIVERABLES.filter((d) => next.has(d));
    const [row] = await tx<{ sa_comment: string | null; presales_stage: PresalesStage }[]>`
      update deals set deliverables = ${deliverables}, sa_comment = coalesce(${input.comment ?? null}::text, sa_comment)
      where id = ${deal.id}
      returning sa_comment, presales_stage`;
    return { deal_id: deal.id, account: deal.account, deliverables, sa_comment: row.sa_comment, score: dealScore({ deliverables, presales_stage: row.presales_stage }) };
  });
}

// ---------- Manager-only: retention, succession, bench ----------

export interface RetentionRisk {
  person_id: string;
  person_name: string;
  risk: "low" | "medium" | "high";
  reason: string;
  action_plan: string;
  updated_by: string;
  updated_at: string;
}

export async function listRetentionRisks(actor: Actor): Promise<RetentionRisk[]> {
  requireManager(actor, "Retention risk");
  return db()<RetentionRisk[]>`
    select r.person_id, p.name as person_name, r.risk, r.reason, r.action_plan, r.updated_by,
           to_char(r.updated_at, 'YYYY-MM-DD') as updated_at
    from retention_risks r join people p on p.id = r.person_id
    order by case r.risk when 'high' then 0 when 'medium' then 1 else 2 end, p.name`;
}

export async function setRetentionRisk(
  actor: Actor,
  input: { personId: string; risk: "low" | "medium" | "high"; reason: string; actionPlan: string },
): Promise<RetentionRisk> {
  requireManager(actor, "Retention risk");
  if (actor.kind !== "user") throw new AccessDenied("Retention risk needs a signed-in manager.");
  await db()`
    insert into retention_risks (person_id, risk, reason, action_plan, updated_by, updated_at)
    values (${input.personId}, ${input.risk}, ${input.reason}, ${input.actionPlan}, ${actor.personId}, now())
    on conflict (person_id) do update
      set risk = excluded.risk, reason = excluded.reason, action_plan = excluded.action_plan,
          updated_by = excluded.updated_by, updated_at = now()`;
  const [row] = (await listRetentionRisks(actor)).filter((r) => r.person_id === input.personId);
  return row;
}

// ---------- 9-box (2P matrix) ----------

export const NINE_BOX_LEVELS = ["Low", "Medium", "High"] as const;

/** Box names, indexed [potential - 1][performance - 1]. */
export const NINE_BOX_NAMES = [
  ["Talent risk", "Effective", "Trusted professional"],
  ["New/Inconsistent player", "Core player", "High performer"],
  ["Rough diamond", "Future star", "Star"],
] as const;

export interface TalentRating {
  person_id: string;
  person_name: string;
  performance: 1 | 2 | 3;
  potential: 1 | 2 | 3;
  box: string;
  note: string | null;
  updated_at: string;
}

export async function listTalentRatings(actor: Actor): Promise<TalentRating[]> {
  requireManager(actor, "The 9-box");
  const rows = await db()<Omit<TalentRating, "box">[]>`
    select t.person_id, p.name as person_name, t.performance, t.potential, t.note, to_char(t.updated_at, 'YYYY-MM-DD') as updated_at
    from talent_ratings t join people p on p.id = t.person_id
    order by t.potential desc, t.performance desc, p.name`;
  return rows.map((r) => ({ ...r, box: NINE_BOX_NAMES[r.potential - 1][r.performance - 1] }));
}

export async function setTalentRating(
  actor: Actor,
  input: { personId: string; performance: 1 | 2 | 3; potential: 1 | 2 | 3; note?: string },
): Promise<TalentRating> {
  requireManager(actor, "The 9-box");
  if (actor.kind !== "user") throw new AccessDenied("The 9-box needs a signed-in manager.");
  const [person] = await db()<{ role: string }[]>`select role from people where id = ${input.personId}`;
  if (person?.role !== "ic") throw new AccessDenied("Only team members (ICs) are placed on the 9-box.");
  await db()`
    insert into talent_ratings (person_id, performance, potential, note, updated_by, updated_at)
    values (${input.personId}, ${input.performance}, ${input.potential}, ${input.note ?? null}, ${actor.personId}, now())
    on conflict (person_id) do update
      set performance = excluded.performance, potential = excluded.potential,
          note = coalesce(${input.note ?? null}, talent_ratings.note), updated_by = excluded.updated_by, updated_at = now()`;
  const [row] = (await listTalentRatings(actor)).filter((r) => r.person_id === input.personId);
  return row;
}

export async function listSuccession(actor: Actor) {
  requireManager(actor, "Succession planning");
  return db()<{ id: number; role_name: string; candidate: string; kind: string; readiness: string; pros: string; cons: string }[]>`
    select id, role_name, candidate, kind, readiness, pros, cons from succession
    order by role_name, case readiness when 'ready_now' then 0 when 'one_year' then 1 else 2 end`;
}

export async function listCandidates(actor: Actor) {
  requireManager(actor, "The warm bench");
  return db()<{ id: number; name: string; current_job: string; focus: string; stage: string; last_contact: string; days_since_contact: number; source: string; notes: string }[]>`
    select id, name, current_job, focus, stage, to_char(last_contact, 'YYYY-MM-DD') as last_contact,
           (current_date - last_contact)::int as days_since_contact, source, notes
    from candidates
    order by case stage when 'offer' then 0 when 'interviewing' then 1 when 'engaged' then 2 else 3 end, last_contact desc`;
}

// ---------- Manager-only: promotion cases ----------

export interface PromotionCase {
  id: number;
  person_id: string;
  person_name: string;
  target_level: string;
  status: "pending_approval" | "approved" | "rejected";
  summary: string;
  case_json: unknown;
  model_used: string;
  created_by: string;
  decided_by: string | null;
  created_at: string;
}

export async function listPromotionCases(actor: Actor): Promise<PromotionCase[]> {
  requireManager(actor, "Promotion cases");
  return db()<PromotionCase[]>`
    select c.id, c.person_id, p.name as person_name, c.target_level, c.status, c.summary, c.case_json,
           c.model_used, c.created_by, c.decided_by, to_char(c.created_at, 'YYYY-MM-DD') as created_at
    from promotion_cases c join people p on p.id = c.person_id
    order by c.created_at desc`;
}

/**
 * Approve or decline a drafted case, from the Talent page, Home or the agent.
 * Managers only; a case already decided keeps its first decision.
 */
export async function decidePromotionCase(actor: Actor, id: number, approve: boolean): Promise<PromotionCase["status"]> {
  requireManager(actor, "Promotion cases");
  const decidedBy = actor.kind === "user" ? actor.personId : null;
  const status = approve ? "approved" : "rejected";
  await db()`
    update promotion_cases set status = ${status}, decided_by = ${decidedBy}, decided_at = now()
    where id = ${id} and status = 'pending_approval'`;
  const [row] = await db()<{ status: PromotionCase["status"] }[]>`select status from promotion_cases where id = ${id}`;
  if (!row) throw new Error(`No promotion case with id ${id}.`);
  return row.status;
}

// ---------- Digests ----------

export async function latestDigest(): Promise<{ week_of: string; body: string } | null> {
  const rows = await db()<{ week_of: string; body: string }[]>`
    select to_char(week_of, 'YYYY-MM-DD') as week_of, body from digests order by week_of desc limit 1`;
  return rows[0] ?? null;
}

export async function saveDigest(actor: Actor, body: string): Promise<{ week_of: string; slack_ts: string | null }> {
  if (actor.kind === "user" && actor.role !== "manager") throw new AccessDenied("Only managers or the scheduler write digests.");
  // One digest per week (keyed on the Monday), so a re-run replaces rather than duplicates.
  const [row] = await db()<{ week_of: string; slack_ts: string | null }[]>`
    insert into digests (week_of, body)
    values (date_trunc('week', current_date)::date, ${body})
    on conflict (week_of) do update set body = excluded.body, created_at = now()
    returning to_char(week_of, 'YYYY-MM-DD') as week_of, slack_ts`;
  return row;
}

/** Remembers the Slack message a week's digest was posted as. */
export async function setDigestSlackTs(weekOf: string, slackTs: string): Promise<void> {
  await db()`update digests set slack_ts = ${slackTs} where week_of = ${weekOf}::date`;
}

// ---------- Library ----------
// Reference architectures and demo assets are team-visible, like the Skills Matrix:
// every signed-in person sees the same Library. Anyone can log a reuse on a deal they
// cover; managers on any deal.

export const ASSET_KINDS = ["demo_script", "playbook", "cheat_sheet", "diagram"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_KIND_LABEL: Record<AssetKind, string> = { demo_script: "Demo script", playbook: "Playbook", cheat_sheet: "Cheat sheet", diagram: "Diagram" };

export interface LibraryUse {
  deal_id: string;
  account: string;
  used_by: string;
  used_on: string;
}

export interface ReferenceArchitecture {
  id: string;
  title: string;
  summary: string;
  problem: string;
  approach: string;
  when_to_use: string;
  watch_outs: string;
  products: string[];
  author_id: string;
  author: string;
  updated_on: string;
  uses: LibraryUse[];
}

export interface DemoAsset {
  id: string;
  title: string;
  kind: AssetKind;
  description: string;
  href: string;
  architecture_id: string | null;
  author_id: string;
  author: string;
  uses: LibraryUse[];
}

async function libraryUses(): Promise<Map<string, LibraryUse[]>> {
  const rows = await db()<(LibraryUse & { item_id: string })[]>`
    select u.item_id, u.deal_id, d.account, p.name as used_by, to_char(u.used_on, 'YYYY-MM-DD') as used_on
    from library_uses u join deals d on d.id = u.deal_id join people p on p.id = u.used_by
    order by u.used_on desc`;
  const byItem = new Map<string, LibraryUse[]>();
  for (const { item_id, ...use } of rows) byItem.set(item_id, [...(byItem.get(item_id) ?? []), use]);
  return byItem;
}

/** Every reference architecture and demo asset, with where each has been used. */
export async function listLibrary(): Promise<{ architectures: ReferenceArchitecture[]; assets: DemoAsset[] }> {
  const [architectures, assets, uses] = await Promise.all([
    db()<Omit<ReferenceArchitecture, "uses">[]>`
      select r.id, r.title, r.summary, r.problem, r.approach, r.when_to_use, r.watch_outs, r.products,
             r.author_id, p.name as author, to_char(r.updated_at, 'YYYY-MM-DD') as updated_on
      from reference_architectures r join people p on p.id = r.author_id order by r.title`,
    db()<Omit<DemoAsset, "uses">[]>`
      select a.id, a.title, a.kind, a.description, a.href, a.architecture_id, a.author_id, p.name as author
      from demo_assets a join people p on p.id = a.author_id order by a.title`,
    libraryUses(),
  ]);
  return {
    architectures: architectures.map((a) => ({ ...a, uses: uses.get(a.id) ?? [] })),
    assets: assets.map((a) => ({ ...a, uses: uses.get(a.id) ?? [] })),
  };
}

/** Finds an architecture or asset by id or by (part of) its title. */
export async function findLibraryItem(query: string): Promise<{ id: string; title: string; kind: "architecture" | AssetKind } | null> {
  const rows = await db()<{ id: string; title: string; kind: "architecture" | AssetKind }[]>`
    select id, title, 'architecture' as kind from reference_architectures where id = ${query} or title ilike ${"%" + query + "%"}
    union all
    select id, title, kind from demo_assets where id = ${query} or title ilike ${"%" + query + "%"}
    order by title`;
  const exact = rows.find((r) => r.id === query || r.title.toLowerCase() === query.toLowerCase());
  if (exact) return exact;
  if (rows.length > 1) throw new Error(`"${query}" matches ${rows.map((r) => r.title).join(", ")}. Which one?`);
  return rows[0] ?? null;
}

/**
 * Logs that an architecture or asset was used on a deal. ICs log it on deals they
 * cover; managers on any deal. Logging the same item on the same deal again is a no-op.
 */
export async function recordLibraryUse(
  actor: Actor,
  input: { itemId: string; dealId: string },
  idempotencyKey: string,
): Promise<{ item_id: string; deal_id: string; account: string; duplicate: boolean }> {
  if (actor.kind !== "user") throw new AccessDenied("Only a signed-in person can log a reuse.");
  const [deal] = await db()<{ id: string; account: string; sa_id: string | null }[]>`select id, account, sa_id from deals where id = ${input.dealId}`;
  if (!deal) throw new Error(`No deal with id "${input.dealId}".`);
  if (actor.role === "ic" && deal.sa_id !== actor.personId) {
    throw new AccessDenied(`You can only log reuse on deals you cover. Ask the SA on ${deal.account} or your manager.`);
  }
  const inserted = await db()`
    insert into library_uses (item_id, deal_id, used_by, idempotency_key)
    values (${input.itemId}, ${deal.id}, ${actor.personId}, ${idempotencyKey})
    on conflict do nothing
    returning item_id`;
  return { item_id: input.itemId, deal_id: deal.id, account: deal.account, duplicate: inserted.length === 0 };
}

// ---------- Compete ----------
// Battlecards are team-visible, like the Library. They carry deal counts, not deal
// names, because SAs only see their own deals on Deal Coverage. An SA sets the main
// competitor on a deal they cover; managers on any deal.

export interface Battlecard {
  id: string;
  competitor: string;
  positioning: string;
  they_win: string[];
  we_win: string[];
  questions: string[];
  objections: { objection: string; answer: string }[];
  proof: string[];
  sources: { label: string; url: string }[];
  owner_id: string;
  owner: string;
  reviewed_on: string;
  open_deals: number;
  won_deals: number;
}

/** Every battlecard, with how many open and won deals it has come up on. */
export async function listBattlecards(): Promise<Battlecard[]> {
  return db()<Battlecard[]>`
    select b.id, b.competitor, b.positioning, b.they_win, b.we_win, b.questions, b.objections, b.proof, b.sources,
           b.owner_id, p.name as owner, to_char(b.reviewed_on, 'YYYY-MM-DD') as reviewed_on,
           (select count(*)::int from deals d where d.competitor = b.id and d.stage < 5) as open_deals,
           (select count(*)::int from deals d where d.competitor = b.id and d.forecast = 'closed') as won_deals
    from battlecards b join people p on p.id = b.owner_id
    order by b.competitor`;
}

/** Finds a battlecard by id or by (part of) the competitor's name, e.g. "amplify". */
export async function findBattlecard(query: string): Promise<{ id: string; competitor: string } | null> {
  const rows = await db()<{ id: string; competitor: string }[]>`
    select id, competitor from battlecards where id = ${query.toLowerCase()} or competitor ilike ${"%" + query + "%"} order by competitor`;
  if (rows.length > 1) throw new Error(`"${query}" matches ${rows.map((r) => r.competitor).join(", ")}. Which one?`);
  return rows[0] ?? null;
}

/** Sets (or clears, with null) the main competitor on a deal. */
export async function setDealCompetitor(
  actor: Actor,
  input: { dealId: string; competitorId: string | null },
): Promise<{ deal_id: string; account: string; competitor: string | null }> {
  if (actor.kind !== "user") throw new AccessDenied("Only a signed-in person can set a deal's competitor.");
  const [deal] = await db()<{ id: string; account: string; sa_id: string | null }[]>`select id, account, sa_id from deals where id = ${input.dealId}`;
  if (!deal) throw new Error(`No deal with id "${input.dealId}".`);
  if (actor.role === "ic" && deal.sa_id !== actor.personId) {
    throw new AccessDenied(`You can only set the competitor on deals you cover. Ask the SA on ${deal.account} or your manager.`);
  }
  await db()`update deals set competitor = ${input.competitorId} where id = ${deal.id}`;
  return { deal_id: deal.id, account: deal.account, competitor: input.competitorId };
}
