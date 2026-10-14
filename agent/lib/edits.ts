import { AccessDenied, type Actor, requireManager } from "./actor";
import { db } from "./db";
import { FORECASTS, type Forecast, type Person, PRESALES_STAGES, type PresalesStage } from "./data";

// Create, change and remove the records the dashboard shows, for the agent's
// edit tools. Same rules as the rest of the data layer:
//   - SAs change their own skills, development plan and achievements.
//   - Managers change anything, including deals, people, coverage needs,
//     succession and the warm bench (the last two stay manager-only to read).
// Every tool that calls these asks the user to confirm first.

function requireUser(actor: Actor, what: string): asserts actor is Extract<Actor, { kind: "user" }> {
  if (actor.kind !== "user") throw new AccessDenied(`${what} needs a signed-in person.`);
}

/** SAs may change only their own records; managers anyone's. */
function requireSelfOrManager(actor: Actor, personId: string, what: string) {
  requireUser(actor, what);
  if (actor.role === "ic" && actor.personId !== personId) {
    throw new AccessDenied(`You can only change your own ${what.toLowerCase()}. Ask your manager to change a colleague's.`);
  }
}

// ---------- Skills Matrix ----------

export const SKILL_CATEGORIES = ["product", "certification", "enablement"] as const;
export const SKILL_STATUSES = ["not_started", "next_focus", "in_progress", "complete"] as const;

/**
 * Sets one person's skill: a product level (0-4), or a certification or soft
 * skill's status and dates. Creates the row if the person doesn't have it yet.
 * `remove` deletes it.
 */
export async function setSkill(
  actor: Actor,
  input: {
    personId: string;
    category: (typeof SKILL_CATEGORIES)[number];
    name: string;
    level?: number;
    status?: (typeof SKILL_STATUSES)[number];
    dueOn?: string | null;
    completedOn?: string | null;
    remove?: boolean;
  },
) {
  requireSelfOrManager(actor, input.personId, "Skills");
  const sql = db();
  if (input.remove) {
    const gone = await sql`delete from skills where person_id = ${input.personId} and category = ${input.category} and name = ${input.name} returning name`;
    return { removed: gone.length > 0 };
  }
  if (input.category === "product" && input.level === undefined) throw new Error("A product skill needs a level from 0 (None) to 4 (Prove).");
  if (input.category !== "product" && input.status === undefined && input.dueOn === undefined && input.completedOn === undefined) {
    throw new Error("Give a status or a date for a certification or soft skill.");
  }
  // Completing something without a date records today.
  const completedOn = input.status === "complete" && input.completedOn === undefined ? new Date().toISOString().slice(0, 10) : input.completedOn;
  const [row] = await sql<{ person_id: string; category: string; name: string; level: number | null; status: string | null; due_on: string | null; completed_on: string | null }[]>`
    insert into skills (person_id, category, name, level, status, due_on, completed_on, updated_at)
    values (${input.personId}, ${input.category}, ${input.name},
            ${input.category === "product" ? (input.level ?? 0) : null},
            ${input.category === "product" ? null : (input.status ?? "not_started")},
            ${input.dueOn ?? null}, ${completedOn ?? null}, now())
    on conflict (person_id, category, name) do update set
      level = coalesce(${input.level ?? null}::int, skills.level),
      status = coalesce(${input.status ?? null}::text, skills.status),
      due_on = case when ${input.dueOn !== undefined} then ${input.dueOn ?? null}::date else skills.due_on end,
      completed_on = case when ${completedOn !== undefined} then ${completedOn ?? null}::date else skills.completed_on end,
      updated_at = now()
    returning person_id, category, name, level, status, to_char(due_on, 'YYYY-MM-DD') as due_on, to_char(completed_on, 'YYYY-MM-DD') as completed_on`;
  return row;
}

// ---------- Development plans ----------

export const DEV_PLAN_STATUSES = ["on_track", "at_risk", "done"] as const;

/** Creates or changes a person's development plan (one per person). */
export async function setDevPlan(
  actor: Actor,
  input: { personId: string; goal?: string; targetLevel?: string; nextStep?: string; dueOn?: string; status?: (typeof DEV_PLAN_STATUSES)[number] },
) {
  requireSelfOrManager(actor, input.personId, "Development plan");
  const sql = db();
  const [current] = await sql<{ id: number }[]>`select id from dev_plans where person_id = ${input.personId} order by updated_at desc limit 1`;
  if (!current) {
    if (!input.goal || !input.targetLevel || !input.nextStep || !input.dueOn) {
      throw new Error("A new development plan needs a goal, target level, next step and due date.");
    }
    await sql`
      insert into dev_plans (person_id, goal, target_level, next_step, due_on, status)
      values (${input.personId}, ${input.goal}, ${input.targetLevel}, ${input.nextStep}, ${input.dueOn}, ${input.status ?? "on_track"})`;
  } else {
    await sql`
      update dev_plans set
        goal = coalesce(${input.goal ?? null}::text, goal),
        target_level = coalesce(${input.targetLevel ?? null}::text, target_level),
        next_step = coalesce(${input.nextStep ?? null}::text, next_step),
        due_on = coalesce(${input.dueOn ?? null}::date, due_on),
        status = coalesce(${input.status ?? null}::text, status),
        updated_at = now()
      where id = ${current.id}`;
  }
  const [row] = await sql<{ goal: string; target_level: string; next_step: string; due_on: string; status: string }[]>`
    select goal, target_level, next_step, to_char(due_on, 'YYYY-MM-DD') as due_on, status
    from dev_plans where person_id = ${input.personId} order by updated_at desc limit 1`;
  return { created: !current, ...row };
}

// ---------- Achievements ----------

/** Edits or removes an achievement. SAs can change only their own. */
export async function editAchievement(
  actor: Actor,
  input: { id: number; title?: string; impact?: string; occurredOn?: string; category?: string; remove?: boolean },
) {
  const [row] = await db()<{ person_id: string }[]>`select person_id from achievements where id = ${input.id}`;
  if (!row) throw new Error(`No achievement with id ${input.id}.`);
  requireSelfOrManager(actor, row.person_id, "Achievements");
  if (input.remove) {
    // An accepted shout-out points at its achievement; let go of it first.
    await db()`update shoutouts set achievement_id = null where achievement_id = ${input.id}`;
    await db()`delete from achievements where id = ${input.id}`;
    return { id: input.id, removed: true };
  }
  const [updated] = await db()<{ id: number; occurred_on: string; category: string; title: string; impact: string }[]>`
    update achievements set
      title = coalesce(${input.title ?? null}::text, title),
      impact = coalesce(${input.impact ?? null}::text, impact),
      occurred_on = coalesce(${input.occurredOn ?? null}::date, occurred_on),
      category = coalesce(${input.category ?? null}::text, category)
    where id = ${input.id}
    returning id, to_char(occurred_on, 'YYYY-MM-DD') as occurred_on, category, title, impact`;
  return updated;
}

// ---------- Deals (managers) ----------

/**
 * Creates a deal or changes its account, AE, SA, sales stage (5 = closed),
 * ACV, close quarter or forecast. SAs keep using update_deal_next_step for
 * their own next steps and presales stage.
 */
export async function upsertDeal(
  actor: Actor,
  input: {
    id?: string;
    account?: string;
    ae?: string;
    saId?: string | null;
    stage?: number;
    acvUsd?: number;
    closeQuarter?: string;
    forecast?: Forecast;
    presalesStage?: PresalesStage;
    nextStep?: string;
  },
) {
  requireManager(actor, "Creating and editing deals");
  if (input.forecast && !FORECASTS.includes(input.forecast)) throw new Error(`Unknown forecast "${input.forecast}".`);
  if (input.presalesStage && !PRESALES_STAGES.includes(input.presalesStage)) throw new Error(`Unknown presales stage "${input.presalesStage}".`);
  const sql = db();
  if (!input.id) {
    if (!input.account || !input.ae || !input.stage || !input.acvUsd || !input.closeQuarter) {
      throw new Error("A new deal needs an account, AE, sales stage, ACV and close quarter.");
    }
    const [{ next }] = await sql<{ next: number }[]>`
      select coalesce(max(substring(id from 3)::int), 1000) + 1 as next from deals where id ~ '^D-[0-9]+$'`;
    const id = `D-${next}`;
    await sql`
      insert into deals (id, account, ae, sa_id, stage, acv_usd, close_quarter, next_step, next_step_on, presales_stage, forecast)
      values (${id}, ${input.account}, ${input.ae}, ${input.saId ?? null}, ${input.stage}, ${input.acvUsd}, ${input.closeQuarter},
              ${input.nextStep ?? "Agree next step"}, current_date, ${input.presalesStage ?? "discovery"}, ${input.forecast ?? "pipeline"})`;
    return { created: true, ...(await dealRow(id)) };
  }
  const updated = await sql`
    update deals set
      account = coalesce(${input.account ?? null}::text, account),
      ae = coalesce(${input.ae ?? null}::text, ae),
      sa_id = case when ${input.saId !== undefined} then ${input.saId ?? null}::text else sa_id end,
      stage = coalesce(${input.stage ?? null}::int, stage),
      acv_usd = coalesce(${input.acvUsd ?? null}::int, acv_usd),
      close_quarter = coalesce(${input.closeQuarter ?? null}::text, close_quarter),
      forecast = coalesce(${input.forecast ?? null}::text, forecast),
      presales_stage = coalesce(${input.presalesStage ?? null}::text, presales_stage),
      next_step = coalesce(${input.nextStep ?? null}::text, next_step),
      next_step_on = case when ${input.nextStep !== undefined} then current_date else next_step_on end
    where id = ${input.id}
    returning id`;
  if (updated.length === 0) throw new Error(`No deal with id "${input.id}".`);
  return { created: false, ...(await dealRow(input.id)) };
}

async function dealRow(id: string) {
  const [row] = await db()<{ id: string; account: string; ae: string; sa: string | null; stage: number; acv_usd: number; close_quarter: string; forecast: string; presales_stage: string; next_step: string }[]>`
    select d.id, d.account, d.ae, p.name as sa, d.stage, d.acv_usd, d.close_quarter, d.forecast, d.presales_stage, d.next_step
    from deals d left join people p on p.id = d.sa_id where d.id = ${id}`;
  return row;
}

// ---------- Coverage needs (managers) ----------

/** Adds, changes or removes one of next quarter's skill needs (the Coverage gaps table). */
export async function setSkillNeed(
  actor: Actor,
  input: { category: (typeof SKILL_CATEGORIES)[number]; name: string; minPeople?: number; minLevel?: number | null; reason?: string; remove?: boolean },
) {
  requireManager(actor, "Coverage needs");
  const sql = db();
  if (input.remove) {
    const gone = await sql`delete from skill_needs where category = ${input.category} and name = ${input.name} returning name`;
    return { removed: gone.length > 0 };
  }
  const [existing] = await sql`select 1 from skill_needs where category = ${input.category} and name = ${input.name}`;
  if (!existing && (input.minPeople === undefined || !input.reason)) throw new Error("A new need needs how many people and the reason.");
  if (input.category === "product" && !existing && input.minLevel == null) throw new Error("A product skill need needs a minimum level (0-4).");
  const [row] = await sql<{ category: string; name: string; min_level: number | null; min_people: number; reason: string }[]>`
    insert into skill_needs (category, name, min_level, min_people, reason)
    values (${input.category}, ${input.name}, ${input.category === "product" ? (input.minLevel ?? null) : null}, ${input.minPeople ?? 1}, ${input.reason ?? ""})
    on conflict (category, name) do update set
      min_level = case when ${input.minLevel !== undefined} then ${input.minLevel ?? null}::int else skill_needs.min_level end,
      min_people = coalesce(${input.minPeople ?? null}::int, skill_needs.min_people),
      reason = coalesce(${input.reason ?? null}::text, skill_needs.reason)
    returning category, name, min_level, min_people, reason`;
  return row;
}

// ---------- Succession and warm bench (managers) ----------

type SuccessionRow = { id: number; role_name: string; candidate: string; kind: string; readiness: string; pros: string; cons: string };
type CandidateRow = { id: number; name: string; current_job: string; focus: string; stage: string; last_contact: string; source: string; notes: string };

export const READINESS = ["ready_now", "one_year", "two_years"] as const;
export const BENCH_STAGES = ["warm", "engaged", "interviewing", "offer"] as const;

/** Adds, changes or removes a succession candidate. Internal candidates are linked to their person. */
export async function upsertSuccession(
  actor: Actor,
  input: { id?: number; roleName?: string; candidate?: string; personId?: string | null; readiness?: (typeof READINESS)[number]; pros?: string; cons?: string; remove?: boolean },
) {
  requireManager(actor, "Succession planning");
  const sql = db();
  if (input.id && input.remove) {
    const gone = await sql`delete from succession where id = ${input.id} returning id`;
    return { removed: gone.length > 0 };
  }
  if (!input.id) {
    if (!input.roleName || !input.candidate || !input.readiness || !input.pros || !input.cons) {
      throw new Error("A new succession candidate needs the role, candidate, readiness, pros and cons.");
    }
    const [row] = await sql<SuccessionRow[]>`
      insert into succession (role_name, candidate, kind, person_id, readiness, pros, cons)
      values (${input.roleName}, ${input.candidate}, ${input.personId ? "internal" : "external"}, ${input.personId ?? null}, ${input.readiness}, ${input.pros}, ${input.cons})
      returning id, role_name, candidate, kind, readiness, pros, cons`;
    return { created: true, ...row };
  }
  const [row] = await sql<SuccessionRow[]>`
    update succession set
      role_name = coalesce(${input.roleName ?? null}::text, role_name),
      candidate = coalesce(${input.candidate ?? null}::text, candidate),
      person_id = case when ${input.personId !== undefined} then ${input.personId ?? null}::text else person_id end,
      kind = case when ${input.personId !== undefined} then (case when ${input.personId ?? null}::text is null then 'external' else 'internal' end) else kind end,
      readiness = coalesce(${input.readiness ?? null}::text, readiness),
      pros = coalesce(${input.pros ?? null}::text, pros),
      cons = coalesce(${input.cons ?? null}::text, cons)
    where id = ${input.id}
    returning id, role_name, candidate, kind, readiness, pros, cons`;
  if (!row) throw new Error(`No succession entry with id ${input.id}.`);
  return { created: false, ...row };
}

/** Adds, changes or removes someone on the warm bench. Logging contact sets last contact to today. */
export async function upsertCandidate(
  actor: Actor,
  input: { id?: number; name?: string; currentJob?: string; focus?: string; stage?: (typeof BENCH_STAGES)[number]; source?: string; notes?: string; contactedToday?: boolean; remove?: boolean },
) {
  requireManager(actor, "The warm bench");
  const sql = db();
  if (input.id && input.remove) {
    const gone = await sql`delete from candidates where id = ${input.id} returning id`;
    return { removed: gone.length > 0 };
  }
  if (!input.id) {
    if (!input.name || !input.currentJob || !input.focus || !input.source) throw new Error("A new candidate needs a name, current job, focus and source.");
    const [row] = await sql<CandidateRow[]>`
      insert into candidates (name, current_job, focus, stage, last_contact, source, notes)
      values (${input.name}, ${input.currentJob}, ${input.focus}, ${input.stage ?? "warm"}, current_date, ${input.source}, ${input.notes ?? ""})
      returning id, name, current_job, focus, stage, to_char(last_contact, 'YYYY-MM-DD') as last_contact, source, notes`;
    return { created: true, ...row };
  }
  const [row] = await sql<CandidateRow[]>`
    update candidates set
      name = coalesce(${input.name ?? null}::text, name),
      current_job = coalesce(${input.currentJob ?? null}::text, current_job),
      focus = coalesce(${input.focus ?? null}::text, focus),
      stage = coalesce(${input.stage ?? null}::text, stage),
      source = coalesce(${input.source ?? null}::text, source),
      notes = coalesce(${input.notes ?? null}::text, notes),
      last_contact = case when ${input.contactedToday ?? false} then current_date else last_contact end
    where id = ${input.id}
    returning id, name, current_job, focus, stage, to_char(last_contact, 'YYYY-MM-DD') as last_contact, source, notes`;
  if (!row) throw new Error(`No warm bench candidate with id ${input.id}.`);
  return { created: false, ...row };
}

// ---------- People (managers) ----------

export const PERSON_LEVELS = ["SA1", "SA2", "SSA", "PSA"] as const;

/** Adds an SA to the team or changes their details. The id is made from the name and never changes. */
export async function upsertPerson(
  actor: Actor,
  input: { id?: string; name?: string; title?: string; level?: (typeof PERSON_LEVELS)[number]; segment?: string; location?: string; startDate?: string },
): Promise<Person & { created: boolean }> {
  requireManager(actor, "Adding and editing team members");
  requireUser(actor, "Adding and editing team members");
  const sql = db();
  const select = (id: string) => sql<Person[]>`
    select id, name, title, level, role, segment, location, to_char(start_date, 'YYYY-MM-DD') as start_date from people where id = ${id}`;
  if (!input.id) {
    if (!input.name || !input.title || !input.level || !input.segment || !input.location) {
      throw new Error("A new team member needs a name, title, level, segment and location.");
    }
    const id = input.name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const [taken] = await sql`select 1 from people where id = ${id}`;
    if (taken) throw new Error(`Someone with the id "${id}" is already on the team.`);
    await sql`
      insert into people (id, name, title, level, role, segment, location, start_date, manager_id)
      values (${id}, ${input.name}, ${input.title}, ${input.level}, 'ic', ${input.segment}, ${input.location}, ${input.startDate ?? new Date().toISOString().slice(0, 10)}, ${actor.personId})`;
    const [row] = await select(id);
    return { ...row, created: true };
  }
  const updated = await sql`
    update people set
      name = coalesce(${input.name ?? null}::text, name),
      title = coalesce(${input.title ?? null}::text, title),
      level = coalesce(${input.level ?? null}::text, level),
      segment = coalesce(${input.segment ?? null}::text, segment),
      location = coalesce(${input.location ?? null}::text, location),
      start_date = coalesce(${input.startDate ?? null}::date, start_date)
    where id = ${input.id}
    returning id`;
  if (updated.length === 0) throw new Error(`No one with the id "${input.id}".`);
  const [row] = await select(input.id);
  return { ...row, created: false };
}
