import { db } from "./db";
import { AccessDenied, type Actor, isManager, requireManager } from "./actor";

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
  status: "not_started" | "in_progress" | "complete" | null;
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
  flags: string[];
}

const STALE_DAYS = 14;
const SA_DEAL_LIMIT = 3; // active stage 2-4 deals per SA before we call it overloaded

/** Applies the business plan's coverage rules to every open deal. */
export async function dealCoverage(actor: Actor): Promise<{ deals: DealRow[]; summary: Record<string, number> }> {
  const rows = await db()<Omit<DealRow, "flags">[]>`
    select d.id, d.account, d.ae, d.sa_id, p.name as sa_name, d.stage, d.acv_usd, d.close_quarter,
           d.next_step, to_char(d.next_step_on, 'YYYY-MM-DD') as next_step_on,
           (current_date - d.next_step_on)::int as days_since_update, d.presales_stage, d.forecast
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
  const stage2plus = deals.filter((d) => d.stage >= 2);
  const summary = {
    open_deals: deals.length,
    stage2plus: stage2plus.length,
    stage2plus_covered_pct: stage2plus.length === 0 ? 100 : Math.round((100 * stage2plus.filter((d) => d.sa_id).length) / stage2plus.length),
    stale_next_steps: deals.filter((d) => d.days_since_update > STALE_DAYS).length,
    stage_misaligned: deals.filter((d) => alignmentFlag(d.presales_stage, d.forecast)).length,
    stage3plus_tech_win_pct: (() => {
      const s3 = deals.filter((d) => d.stage >= 3);
      return s3.length === 0 ? 100 : Math.round((100 * s3.filter((d) => d.presales_stage === "tech_win").length) / s3.length);
    })(),
  };
  return { deals: visible, summary };
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

// ---------- Digests ----------

export async function latestDigest(): Promise<{ week_of: string; body: string } | null> {
  const rows = await db()<{ week_of: string; body: string }[]>`
    select to_char(week_of, 'YYYY-MM-DD') as week_of, body from digests order by week_of desc limit 1`;
  return rows[0] ?? null;
}

export async function saveDigest(actor: Actor, body: string): Promise<{ week_of: string }> {
  if (actor.kind === "user" && actor.role !== "manager") throw new AccessDenied("Only managers or the scheduler write digests.");
  // One digest per week (keyed on the Monday), so a re-run replaces rather than duplicates.
  const [row] = await db()<{ week_of: string }[]>`
    insert into digests (week_of, body)
    values (date_trunc('week', current_date)::date, ${body})
    on conflict (week_of) do update set body = excluded.body, created_at = now()
    returning to_char(week_of, 'YYYY-MM-DD') as week_of`;
  return row;
}
