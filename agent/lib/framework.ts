// The SA career framework used for promotion cases. Deliberately small and
// explicit: the workflow scores evidence against these criteria in code first,
// and only then asks the model to write the narrative. That keeps the judgement
// auditable ("2 of 3 leadership achievements") instead of model vibes.

export type Level = "SA1" | "SA2" | "SSA" | "PSA";

export interface Criterion {
  id: string;
  label: string;
  /** Evaluated in code against the person's record. */
  check: (e: Evidence) => { met: boolean; detail: string };
}

export interface Evidence {
  person: { id: string; name: string; level: string; title: string; start_date: string };
  tenureMonths: number;
  skills: { category: string; name: string; level: number | null; status: string | null }[];
  achievements: { occurred_on: string; category: string; title: string; impact: string }[];
  devPlan: { goal: string; target_level: string; status: string; overdue: boolean } | null;
}

const count = (e: Evidence, category: string) => e.achievements.filter((a) => a.category === category).length;
const deepSkills = (e: Evidence, min: number) =>
  e.skills.filter((s) => s.category === "product" && (s.level ?? 0) >= min).map((s) => s.name);
const done = (e: Evidence, category: string) =>
  e.skills.filter((s) => s.category === category && s.status === "complete").map((s) => s.name);

export const NEXT_LEVEL: Record<string, Level | undefined> = { SA1: "SA2", SA2: "SSA", SSA: "PSA" };

export const FRAMEWORK: Record<Level, Criterion[]> = {
  SA1: [],
  SA2: [
    { id: "tenure", label: "12+ months in role", check: (e) => ({ met: e.tenureMonths >= 12, detail: `${e.tenureMonths} months` }) },
    { id: "customer", label: "Runs customer engagements independently (2+ customer wins)", check: (e) => ({ met: count(e, "customer") >= 2, detail: `${count(e, "customer")} customer achievements` }) },
    { id: "depth", label: "Working depth (level 2+) across 4 product areas", check: (e) => ({ met: deepSkills(e, 2).length >= 4, detail: deepSkills(e, 2).join(", ") || "none" }) },
  ],
  SSA: [
    { id: "tenure", label: "18+ months at SA2", check: (e) => ({ met: e.tenureMonths >= 18, detail: `${e.tenureMonths} months` }) },
    { id: "customer", label: "Leads complex POVs to a technical win (3+ customer wins)", check: (e) => ({ met: count(e, "customer") >= 3, detail: `${count(e, "customer")} customer achievements` }) },
    { id: "depth", label: "Deep (level 3+) in 3 product areas", check: (e) => ({ met: deepSkills(e, 3).length >= 3, detail: deepSkills(e, 3).join(", ") || "none" }) },
    { id: "cert", label: "At least one hyperscaler certification", check: (e) => ({ met: done(e, "certification").length >= 1, detail: done(e, "certification").join(", ") || "none" }) },
    { id: "pipeline", label: "Contributes to pipeline (workshops, account days)", check: (e) => ({ met: count(e, "pipeline") + count(e, "community") >= 1, detail: `${count(e, "pipeline") + count(e, "community")} pipeline or community achievements` }) },
  ],
  PSA: [
    { id: "tenure", label: "24+ months total in the team", check: (e) => ({ met: e.tenureMonths >= 24, detail: `${e.tenureMonths} months` }) },
    { id: "customer", label: "Owns strategic technical wins (3+ customer wins)", check: (e) => ({ met: count(e, "customer") >= 3, detail: `${count(e, "customer")} customer achievements` }) },
    { id: "expert", label: "Expert (level 4) in 2+ areas and teaches others", check: (e) => ({ met: deepSkills(e, 4).length >= 2, detail: deepSkills(e, 4).join(", ") || "none" }) },
    { id: "multiplier", label: "Multiplies the team: enablement or mentoring (2+ achievements)", check: (e) => ({ met: count(e, "enablement") + count(e, "leadership") >= 2, detail: `${count(e, "enablement") + count(e, "leadership")} enablement or leadership achievements` }) },
    { id: "enablement", label: "Completed Champion Building and Value Engineering", check: (e) => {
      const d = done(e, "enablement");
      const need = ["Champion Building", "Value Engineering (ESAT)"];
      const missing = need.filter((n) => !d.includes(n));
      return { met: missing.length === 0, detail: missing.length === 0 ? "both complete" : `missing ${missing.join(", ")}` };
    } },
  ],
};

export function scoreAgainst(level: Level, evidence: Evidence) {
  const results = FRAMEWORK[level].map((c) => ({ id: c.id, label: c.label, ...c.check(evidence) }));
  return { level, met: results.filter((r) => r.met).length, total: results.length, results };
}
