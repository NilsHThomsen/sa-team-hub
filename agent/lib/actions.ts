import { type Actor, isManager } from "./actor";
import { alignmentFlag, dealCoverage, LABEL, listCareerGoals, listDevPlans, listPendingShoutoutsFor, listPromotionCases, listRetentionRisks, skillsMatrix, STALE_DAYS } from "./data";

// The home page's "Action items": what this person should do next, built only
// from data functions that already enforce access, so an IC never sees a
// colleague's private records here and a manager sees the team's.

export interface ActionItem {
  kind: "shoutout" | "approval" | "deal" | "dev_plan" | "retention" | "career_goal" | "enablement";
  title: string;
  detail: string;
  href: string;
  urgent: boolean;
  /** Who the item is about, for the manager's person filter. */
  personId: string | null;
  /** Set on shout-out items, which the home page answers in place. */
  shoutoutId?: number;
  /** Set on promotion-case approvals, which the home page answers in place. */
  promotionCaseId?: number;
}

const KIND_ORDER: ActionItem["kind"][] = ["shoutout", "approval", "deal", "dev_plan", "retention", "career_goal", "enablement"];
const DUE_SOON_DAYS = 30;

export async function actionItems(actor: Actor): Promise<ActionItem[]> {
  if (actor.kind !== "user") return [];
  const manager = isManager(actor);
  const me = actor.personId;

  const [shoutouts, coverage, plans, goals, skills, cases, risks] = await Promise.all([
    listPendingShoutoutsFor(actor),
    dealCoverage(actor),
    listDevPlans(actor),
    listCareerGoals(actor),
    manager ? Promise.resolve([]) : skillsMatrix(),
    manager ? listPromotionCases(actor) : Promise.resolve([]),
    manager ? listRetentionRisks(actor) : Promise.resolve([]),
  ]);
  const items: ActionItem[] = [];

  // Shout-outs a teammate sent you, waiting for you to accept before they reach your achievements doc.
  // personId is null so a manager's person filter never hides their own.
  for (const s of shoutouts) {
    items.push({ kind: "shoutout", title: `${s.from_name} sent you a shout-out: ${s.title}`, detail: s.message, href: "/achievements", urgent: false, personId: null, shoutoutId: s.id });
  }

  // Approvals: promotion cases drafted and waiting for the manager's decision.
  for (const c of cases.filter((c) => c.status === "pending_approval")) {
    items.push({
      kind: "approval",
      title: `Decide on ${c.person_name}'s promotion case to ${c.target_level}`,
      detail: c.summary,
      href: "/talent",
      urgent: true,
      personId: c.person_id,
      promotionCaseId: c.id,
    });
  }

  // Deals: an SA's own deals; for a manager, the team's deals that need a manager.
  for (const d of coverage.deals) {
    const mine = d.sa_id === me;
    if (mine) {
      if (d.days_since_update > STALE_DAYS) {
        items.push({ kind: "deal", title: `Update the next step on ${d.account}`, detail: `Last updated ${d.days_since_update} days ago: "${d.next_step}"`, href: "/deals", urgent: true, personId: d.sa_id });
      }
      if (d.stage >= 3 && d.presales_stage !== "tech_win") {
        items.push({ kind: "deal", title: `Secure the technical win on ${d.account}`, detail: `Sales stage ${d.stage}, presales stage is ${LABEL[d.presales_stage]}.`, href: "/deals", urgent: false, personId: d.sa_id });
      }
    }
    const mismatch = alignmentFlag(d.presales_stage, d.forecast);
    if (mismatch && (mine || manager)) {
      items.push({ kind: "deal", title: `Raise the forecast with ${d.ae} on ${d.account}`, detail: `${mismatch[0].toUpperCase()}${mismatch.slice(1)}.`, href: "/deals", urgent: false, personId: d.sa_id });
    }
    if (manager && d.stage >= 2 && !d.sa_id) {
      items.push({ kind: "deal", title: `Assign an SA to ${d.account}`, detail: `Stage ${d.stage} with no SA covering it.`, href: "/deals", urgent: true, personId: null });
    }
  }

  // Development plans: your own overdue step, or (managers) each overdue plan on the team.
  for (const p of plans.filter((p) => p.overdue)) {
    items.push(
      p.person_id === me
        ? { kind: "dev_plan", title: "Your development plan step is overdue", detail: `${p.next_step} (due ${p.due_on})`, href: "/dev-plans", urgent: true, personId: p.person_id }
        : { kind: "dev_plan", title: `Check in with ${p.person_name} on their development plan`, detail: `${p.next_step} was due ${p.due_on}.`, href: "/dev-plans", urgent: false, personId: p.person_id },
    );
  }

  // Retention (managers only, from a manager-only query).
  for (const r of risks.filter((r) => r.risk === "high")) {
    items.push({ kind: "retention", title: `Follow up on ${r.person_name}'s retention plan`, detail: r.action_plan, href: "/talent", urgent: true, personId: r.person_id });
  }

  // Career goals not set yet.
  for (const g of goals.filter((g) => !g.goal)) {
    items.push(
      g.person_id === me
        ? { kind: "career_goal", title: "Set your career goal", detail: "Pick the role you are working towards on Dev Plans.", href: "/dev-plans", urgent: false, personId: me }
        : { kind: "career_goal", title: `Agree a career goal with ${g.person_name}`, detail: "No goal set yet.", href: "/dev-plans", urgent: false, personId: g.person_id },
    );
  }

  // Certifications and soft skills (enablement) due soon or overdue (an SA's own).
  const today = Date.now();
  for (const s of skills) {
    if (s.person_id !== me || s.status === "complete" || !s.due_on) continue;
    const days = Math.round((Date.parse(s.due_on) - today) / 86_400_000);
    if (days > DUE_SOON_DAYS) continue;
    items.push({
      kind: "enablement",
      title: `Finish ${s.name}`,
      detail: days < 0 ? `Overdue since ${s.due_on}.` : `Due ${s.due_on} (${days} days).`,
      href: "/skills",
      urgent: days < 0,
      personId: me,
    });
  }

  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
