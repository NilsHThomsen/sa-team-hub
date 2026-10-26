// Creates the schema and loads a fictional ANZ SA team.
//
//   DATABASE_URL=postgres://... node db/setup.ts          # create + seed if empty
//   DATABASE_URL=postgres://... node db/setup.ts --reset  # wipe and reseed (demo reset)
//   node db/setup.ts --if-configured                      # build step: skips when no database is set
//
// Everyone here is invented. The shape of the data (achievements doc, skills
// matrix, development plans, retention notes, warm bench, succession, deal
// coverage) comes from the presales business plan this app is modelled on.
// Dates are relative to "today" so stale next steps and overdue plans always
// look realistic whenever the demo is reset.

import { readFileSync } from "node:fs";
import postgres from "postgres";
import { ADOPTION_PRODUCTS } from "../agent/lib/adoption.ts";
import { fiscalQuarter } from "../agent/lib/fiscal.ts"; // .ts: db:setup runs under plain node

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
// Every Vercel build runs this, so a deploy brings the database up to date on its own.
// A build with no real database (a local build, or a pulled env file with hidden values) just skips it.
if (process.argv.includes("--if-configured") && !url?.startsWith("postgres")) {
  console.log("No database configured; skipping db setup.");
  process.exit(0);
}
if (!url) throw new Error("Set DATABASE_URL (or POSTGRES_URL) first.");

const root = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 1, onnotice: () => {} });
// Everything below runs inside one transaction (see main), so a failed seed or migration
// leaves the database exactly as it was instead of half-wiped.
let sql = root;
const reset = process.argv.includes("--reset");

const day = (offset: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

const MANAGER = "jordan-hayes";

const people = [
  { id: MANAGER, name: "Nils Thomsen", title: "SA Manager, ANZ", level: "MGR", role: "manager", segment: "All", location: "Sydney", start: "2023-05-01" },
  { id: "priya-nair", name: "Priya Nair", title: "Senior Solutions Architect", level: "SSA", role: "ic", segment: "Enterprise (FSI)", location: "Sydney", start: "2024-01-15" },
  { id: "tom-becker", name: "Tom Becker", title: "Solutions Architect", level: "SA2", role: "ic", segment: "Public Sector", location: "Canberra", start: "2024-08-01" },
  { id: "aiko-tanaka", name: "Aiko Tanaka", title: "Principal Solutions Architect", level: "PSA", role: "ic", segment: "Strategic", location: "Sydney", start: "2022-03-01" },
  { id: "liam-oconnor", name: "Liam O'Connor", title: "Solutions Architect", level: "SA2", role: "ic", segment: "Commercial", location: "Melbourne", start: "2025-02-10" },
  { id: "sofia-rossi", name: "Sofia Rossi", title: "Senior Solutions Architect", level: "SSA", role: "ic", segment: "Enterprise (Retail)", location: "Melbourne", start: "2023-09-04" },
  { id: "ravi-menon", name: "Ravi Menon", title: "Senior Solutions Architect", level: "SSA", role: "ic", segment: "Public Sector", location: "Canberra", start: "2023-11-20" },
  { id: "hannah-kim", name: "Hannah Kim", title: "Solutions Architect", level: "SA1", role: "ic", segment: "Commercial", location: "Sydney", start: day(-130) },
  { id: "jack-wilson", name: "Jack Wilson", title: "Senior Solutions Architect", level: "SSA", role: "ic", segment: "Telco & Media", location: "Sydney", start: "2024-04-08" },
  { id: "mei-chen", name: "Mei Chen", title: "Solutions Architect", level: "SA2", role: "ic", segment: "Enterprise", location: "Auckland", start: "2025-07-14" },
  { id: "daniel-okafor", name: "Daniel Okafor", title: "Senior Solutions Architect", level: "SSA", role: "ic", segment: "Strategic", location: "Brisbane", start: "2022-10-03" },
];

// Vercel product areas an SA demos and proves.
const productSkills = ["Next.js & Rendering", "Caching & CDN", "AI Cloud (AI SDK, Gateway, Sandbox, Workflows)", "Firewall & Security", "Fluid Compute & Functions", "Observability", "v0"];
// Levels per person in productSkills order: 0 None, 1 Elevator, 2 Present, 3 Demo, 4 Prove (see agent/lib/skill-levels.ts).
const levels: Record<string, number[]> = {
  "priya-nair": [4, 3, 3, 4, 3, 3, 3],
  "tom-becker": [2, 2, 1, 3, 2, 2, 2],
  "aiko-tanaka": [4, 4, 4, 3, 4, 3, 4],
  "liam-oconnor": [3, 2, 2, 1, 2, 1, 2],
  "sofia-rossi": [3, 3, 2, 2, 4, 2, 3],
  "ravi-menon": [3, 3, 2, 4, 3, 3, 2],
  "hannah-kim": [2, 1, 2, 1, 0, 1, 3],
  "jack-wilson": [3, 4, 3, 2, 3, 4, 4],
  "mei-chen": [3, 2, 3, 2, 1, 2, 3],
  "daniel-okafor": [4, 3, 2, 3, 4, 3, 2],
};

type Status = "not_started" | "next_focus" | "in_progress" | "complete";
// [name, status, completed offset (days) or null, due offset or null]
const certs: Record<string, [string, Status, number | null, number | null][]> = {
  "priya-nair": [["AWS Solutions Architect Professional", "complete", -400, null], ["Azure Solutions Architect Expert", "in_progress", null, 45]],
  "tom-becker": [["AWS Solutions Architect Associate", "complete", -200, null]],
  "aiko-tanaka": [["AWS Solutions Architect Professional", "complete", -700, null], ["Google Cloud Professional Architect", "complete", -300, null]],
  "liam-oconnor": [["AWS Solutions Architect Associate", "in_progress", null, -10]],
  "sofia-rossi": [["Azure Solutions Architect Expert", "complete", -150, null]],
  "ravi-menon": [["AWS Solutions Architect Professional", "complete", -500, null]],
  "hannah-kim": [["AWS Solutions Architect Associate", "next_focus", null, 90]],
  "jack-wilson": [["Google Cloud Professional Architect", "in_progress", null, 30]],
  "mei-chen": [["Azure Solutions Architect Expert", "not_started", null, 60]],
  "daniel-okafor": [["AWS Solutions Architect Professional", "complete", -250, null], ["Azure Solutions Architect Expert", "complete", -90, null]],
};

const PSD_REASON = "A PSD (Presales Strategy Document) is required on deals over US$200k.";
const enablementItems = ["Demo2Win", "Storytelling for Technical Sellers", "Champion Building", "Value Engineering (PSD)"];
// Status per person in enablementItems order.
const enablement: Record<string, Status[]> = {
  "priya-nair": ["complete", "complete", "complete", "in_progress"],
  "tom-becker": ["complete", "in_progress", "not_started", "not_started"],
  "aiko-tanaka": ["complete", "complete", "complete", "complete"],
  "liam-oconnor": ["complete", "not_started", "next_focus", "not_started"],
  "sofia-rossi": ["complete", "complete", "in_progress", "complete"],
  "ravi-menon": ["complete", "complete", "complete", "not_started"],
  "hannah-kim": ["in_progress", "not_started", "not_started", "not_started"],
  "jack-wilson": ["complete", "in_progress", "complete", "not_started"],
  "mei-chen": ["complete", "not_started", "in_progress", "next_focus"],
  "daniel-okafor": ["complete", "complete", "complete", "complete"],
};

const skillNeeds = [
  { category: "product", name: "AI Cloud (AI SDK, Gateway, Sandbox, Workflows)", min_level: 3, min_people: 5, reason: "Agent and AI Cloud deals make up a growing share of next quarter's APJ pipeline." },
  { category: "product", name: "Caching & CDN", min_level: 3, min_people: 5, reason: "Most migration POCs are judged on Core Web Vitals and cache hit ratio." },
  { category: "product", name: "Firewall & Security", min_level: 3, min_people: 4, reason: "FSI and Public Sector security reviews need a deep SA in the room." },
  { category: "certification", name: "AWS Solutions Architect Professional", min_level: null, min_people: 2, reason: "Business plan target: at least 2 people certified per hyperscaler." },
  { category: "certification", name: "Azure Solutions Architect Expert", min_level: null, min_people: 2, reason: "Business plan target: at least 2 people certified per hyperscaler." },
  { category: "certification", name: "Google Cloud Professional Architect", min_level: null, min_people: 2, reason: "Business plan target: at least 2 people certified per hyperscaler." },
  { category: "enablement", name: "Champion Building", min_level: null, min_people: 7, reason: "Not enough true champions in late-stage deals (business plan weakness)." },
  { category: "enablement", name: "Value Engineering (PSD)", min_level: null, min_people: 6, reason: PSD_REASON },
];

const achievements = [
  ["priya-nair", -6, "customer", "Technical win at Harbour Bank", "Led a 3-week POV migrating the retail banking site to Next.js; LCP down 41%, unblocked a US$480k deal."],
  ["priya-nair", -34, "enablement", "Ran Caching deep-dive for the APJ team", "45 SAs and AEs attended; recording now part of new-hire onboarding."],
  ["priya-nair", -71, "leadership", "Mentored Hannah through first POC", "Weekly pairing; Hannah ran the Kestrel Insurance demo solo."],
  ["tom-becker", -12, "customer", "Security review passed for Dept. of Transport", "Completed the IRAP-aligned questionnaire, removing the last technical blocker."],
  ["tom-becker", -48, "pipeline", "Public Sector workshop in Canberra", "Co-ran with the AE; 6 agencies attended, 2 new opportunities created."],
  ["aiko-tanaka", -3, "leadership", "Drafted the APJ agent reference architecture", "Adopted by the field as the standard eve + AI Gateway pattern for POCs."],
  ["aiko-tanaka", -40, "community", "Spoke at Sydney Next.js meetup", "200 attendees; 14 inbound leads tagged to the session."],
  ["liam-oconnor", -9, "customer", "Closed Brightside Energy POC in 5 days", "Preview Deployments won over the marketing team; deal signed same quarter."],
  ["sofia-rossi", -15, "customer", "Rolled out incremental migration plan at Tasman Retail", "First 20% of routes live behind the existing CDN with zero downtime."],
  ["sofia-rossi", -60, "enablement", "Built the migration POV playbook", "Standard scope, success criteria and timeline now used on every migration POV."],
  ["ravi-menon", -20, "customer", "Data sovereignty design for Services Australia", "Architecture kept data in-region and passed the agency's design authority."],
  ["hannah-kim", -11, "customer", "First solo demo at Kestrel Insurance", "Ran the AI SDK chatbot demo; customer asked for a follow-up workshop."],
  ["jack-wilson", -5, "pipeline", "Telco account day at Southern Cross Mobile", "Mapped 4 new use cases; 2 opportunities created worth US$310k."],
  ["jack-wilson", -52, "community", "Hosted observability roundtable", "8 platform leads attended; feedback shared with Product."],
  ["mei-chen", -18, "customer", "AI Gateway pilot at Kiwi Freight", "Cut model spend 28% by routing to cheaper models with failover."],
  ["daniel-okafor", -8, "leadership", "Led the QBR technical deal review", "Reviewed all top-15 deals; flagged 3 with no technical win plan."],
  ["daniel-okafor", -44, "customer", "Strategic architecture review at Coral Airlines", "Set the 12-month platform roadmap with the CTO."],
] as const;

const devPlans = [
  ["priya-nair", "Principal readiness: lead a strategic account and publish one reference architecture", "PSA", "Present the Harbour Bank architecture at the APJ field call", 21, "on_track"],
  ["tom-becker", "Broaden beyond Public Sector into Enterprise accounts", "SSA", "Shadow Sofia on two Enterprise discovery calls", -5, "at_risk"],
  ["aiko-tanaka", "Grow field leadership: run the APJ architecture council", "PSA", "Agree council charter with the regional VP", 30, "on_track"],
  ["liam-oconnor", "Deepen security and compliance skills", "SSA", "Finish the AWS SA Associate certification", -10, "at_risk"],
  ["sofia-rossi", "Senior to Principal: own the migration practice", "PSA", "Run the migration playbook workshop for APJ", 45, "on_track"],
  ["ravi-menon", "Expand AE coverage in Public Sector", "PSA", "Joint account plan with a second Federal AE", -20, "at_risk"],
  ["hannah-kim", "Ramp to independent SA", "SA2", "Run a full POV with Priya as backup", 40, "on_track"],
  ["jack-wilson", "Lead the Telco vertical play", "PSA", "Draft the telco industry pitch and demo", 14, "on_track"],
  ["mei-chen", "Senior SA readiness", "SSA", "Complete Champion Building and write a PSD", 25, "on_track"],
  ["daniel-okafor", "Complete management training", "MGR", "Presales Collective management training", 182, "on_track"],
  ["daniel-okafor", "Prepare for people management", "MGR", "Act as manager during Nils's leave and run two team meetings", 60, "on_track"],
] as const;

// [person, career goal, note]; goals must be one of CAREER_GOALS in agent/lib/career-goals.ts.
const careerGoals = [
  ["priya-nair", "Principal SA", "Wants to stay hands-on and lead strategic FSI accounts."],
  ["tom-becker", "Senior SA", ""],
  ["aiko-tanaka", "Field CTO", "Prefers the technical track over people management."],
  ["liam-oconnor", "Product Manager", "Interested in a move to product in 18-24 months."],
  ["sofia-rossi", "Principal SA", ""],
  ["ravi-menon", "Principal SA", ""],
  ["hannah-kim", "Senior SA", ""],
  ["jack-wilson", "Developer Relations", "Enjoys meetups and content; exploring a DevRel path."],
  ["mei-chen", "Senior SA", ""],
  ["daniel-okafor", "Manager", "Succession candidate for the SA Manager role."],
] as const;

// [id, account, AE, SA, sales stage 1-5, ACV, close quarter (0 = this fiscal quarter, 1 = next), next step, next step age (days), presales stage, forecast]
// D-1003 (Commit, no tech win) and D-1006 (tech win, only Upside) are deliberately out of line.
const deals = [
  ["D-1001", "Harbour Bank", "Grace Liu", "priya-nair", 4, 480000, 0, "Exec readout of POV results", -3, "tech_win", "commit"],
  ["D-1002", "Tasman Retail", "Marco Silva", "sofia-rossi", 3, 260000, 0, "Migration phase 2 scoping", -6, "technical_validation", "upside"],
  ["D-1003", "Dept. of Transport", "Anna Webb", "tom-becker", 3, 350000, 1, "Procurement panel submission", -22, "technical_validation", "commit"],
  ["D-1004", "Southern Cross Mobile", "Ben Harris", "jack-wilson", 2, 310000, 1, "Discovery workshop on AI support agent", -2, "discovery", "pipeline"],
  ["D-1005", "Coral Airlines", "Grace Liu", "daniel-okafor", 4, 720000, 0, "Security and architecture sign-off", -9, "tech_win", "commit"],
  ["D-1006", "Kiwi Freight", "Tama Ngata", "mei-chen", 3, 140000, 0, "Expand AI Gateway pilot to production", -4, "tech_win", "upside"],
  ["D-1007", "Services Australia", "Anna Webb", "ravi-menon", 2, 900000, 2, "Design authority follow-up", -31, "solution_design", "pipeline"],
  ["D-1008", "Brightside Energy", "Liam Ford", "liam-oconnor", 5, 95000, 0, "Closed won, hand over to onboarding", -1, "tech_win", "closed"],
  ["D-1009", "Kestrel Insurance", "Marco Silva", "hannah-kim", 2, 180000, 1, "Follow-up AI workshop", -8, "discovery", "pipeline"],
  ["D-1010", "Pacific Media Group", "Ben Harris", null, 3, 410000, 1, "Customer asked for a POC proposal", -12, "solution_design", "upside"],
  ["D-1011", "Metro Health", "Anna Webb", null, 2, 230000, 1, "Initial discovery call held", -17, "discovery", "pipeline"],
  ["D-1012", "Harbour Bank (Wealth)", "Grace Liu", "priya-nair", 2, 200000, 2, "Intro to wealth platform team", -26, "discovery", "pipeline"],
  ["D-1013", "Outback Outdoors", "Liam Ford", "liam-oconnor", 1, 60000, 2, "Qualify budget", -40, "discovery", "pipeline"],
  ["D-1014", "Aurora Logistics", "Tama Ngata", "priya-nair", 3, 330000, 1, "Agent POC success criteria", -5, "technical_validation", "strong_upside"],
  ["D-1015", "Lakeside University", "Ben Harris", "aiko-tanaka", 3, 290000, 0, "Run the agent POC with the research IT team", -4, "technical_validation", "strong_upside"],
] as const;

// Deal scorecards for this quarter's biggest deals: [deal, deliverables done, SA comment].
const dealScorecards = [
  ["D-1005", ["presentation", "demo", "poc", "infosec_review"], "Architecture and security signed off; waiting on procurement paperwork."],
  ["D-1001", ["presentation", "demo", "poc"], "POV hit every success criterion; InfoSec review booked for next week."],
  ["D-1015", ["presentation", "demo"], "POC environment ready and success criteria agreed with research IT."],
  ["D-1002", ["presentation", "demo", "poc"], "Phase 1 migration live; InfoSec review needed before phase 2."],
  ["D-1006", ["presentation", "demo", "poc", "infosec_review"], "Pilot cut model spend 28%; ready for the AE to move the forecast to Commit."],
] as const;

const retention = [
  ["priya-nair", "medium", "Carrying Harbour Bank and Aurora at the same time; at risk of burnout and of being approached for Principal roles elsewhere.", "Move Aurora to Jack after POC; put Priya forward for Principal in the mid-year cycle."],
  ["tom-becker", "medium", "Wants to move out of Public Sector after two years of long procurement cycles.", "Rotate onto two Enterprise accounts once the new Public Sector SA starts."],
  ["aiko-tanaka", "low", "Engaged; enjoys the architecture council work.", "Keep stretch work flowing; consider for succession."],
  ["liam-oconnor", "low", "Settled and productive.", "Support certification with study time."],
  ["sofia-rossi", "low", "Energised by owning the migration playbook.", "Keep visibility with APJ leadership."],
  ["ravi-menon", "medium", "Only one Federal AE engages him, which limits his deal flow and visibility.", "Joint account plan with a second AE; raise with the RVP."],
  ["hannah-kim", "low", "Ramping well with Priya as mentor.", "Keep mentoring cadence weekly."],
  ["jack-wilson", "low", "Excited about leading the Telco vertical.", "Give him the telco industry pitch to own."],
  ["mei-chen", "high", "Approached by a competitor; compensation now below band after the market moved.", "Compensation review this month; give her the Kiwi Freight production rollout as a visible win."],
  ["daniel-okafor", "low", "Keen to move into management.", "Acting manager during leave; management training."],
] as const;

// 9-box: [person, performance, potential, note], 1 low / 2 medium / 3 high.
const talentRatings = [
  ["priya-nair", 3, 3, "Carrying two strategic deals at once; ready for Principal."],
  ["aiko-tanaka", 3, 2, "Deep expert and go-to architect; happy in the current scope."],
  ["sofia-rossi", 3, 2, "Owns the migration playbook; consistently strong delivery."],
  ["daniel-okafor", 2, 3, "Solid delivery and a strong pull towards leading people."],
  ["mei-chen", 2, 3, "Fast ramp and strong customer feedback in her first months."],
  ["hannah-kim", 1, 3, "Still ramping; early signals are very strong."],
  ["jack-wilson", 2, 2, "Reliable; the Telco vertical is his chance to step up."],
  ["ravi-menon", 2, 2, "Good work held back by limited deal flow."],
  ["tom-becker", 2, 1, "Delivers well but wants to leave Public Sector."],
  ["liam-oconnor", 1, 2, "Quieter quarter; certification and pipeline building under way."],
] as const;

async function seedTalentRatings() {
  for (const [personId, performance, potential, note] of talentRatings) {
    await sql`insert into talent_ratings ${sql({ person_id: personId, performance, potential, note, updated_by: MANAGER })}`;
  }
}

const succession = [
  ["SA Manager, ANZ", "Daniel Okafor", "internal", "daniel-okafor", "one_year", "Knows the team, products and customers; trusted by AEs.", "No people management experience yet; currently being mentored."],
  ["SA Manager, ANZ", "Aiko Tanaka", "internal", "aiko-tanaka", "two_years", "Strongest technical leader; respected across APJ.", "Prefers the Principal track; would need to want it."],
  ["SA Manager, ANZ", "Rob Castillo", "external", null, "ready_now", "Has run a 10-person SA team at a cloud vendor.", "New to the platform and the ANZ customer base."],
] as const;

const candidates = [
  ["Ella Whitford", "Senior SE at a CDN vendor", "Caching, security", "engaged", -9, "Referral (Jack)", "Strong on edge security; open to a move in Q1."],
  ["Arjun Patel", "Solutions Architect at a hyperscaler", "AI and agents", "warm", -30, "Meetup", "Built agent demos at the Sydney meetup; keep warm."],
  ["Chloe Martin", "Frontend lead at a retailer", "Next.js, migrations", "interviewing", -3, "Inbound", "Customer-side experience; would ramp fast on migrations."],
  ["Noah Fraser", "Presales at an observability vendor", "Observability, OTel", "warm", -45, "Ex-colleague", "Good cultural fit; waiting on vesting cliff in March."],
  ["Leila Haddad", "Platform architect at a bank", "Security & compliance, FSI", "engaged", -14, "Referral (Priya)", "Would strengthen the FSI bench."],
] as const;

// ESAT was renamed to PSD (Presales Strategy Document). Already-seeded databases
// get the same rename here, so `db:setup` updates them without a reset.
async function renameEsatToPsd() {
  await sql`update skills set name = 'Value Engineering (PSD)' where name = 'Value Engineering (ESAT)'`;
  await sql`update skill_needs set name = 'Value Engineering (PSD)', reason = ${PSD_REASON} where name = 'Value Engineering (ESAT)'`;
  await sql`update dev_plans set next_step = replace(next_step, 'run an ESAT', 'write a PSD') where next_step like '%ESAT%'`;
}

// Product skills renamed to Vercel product areas. Already-seeded databases get the same rename.
const SKILL_RENAMES = [
  ["AI SDK & Agents", "AI Cloud (AI SDK, Gateway, Sandbox, Workflows)"],
  ["AI SDK & AI Gateway", "AI Cloud (AI SDK, Gateway, Sandbox, Workflows)"],
  ["Security & Compliance", "Firewall & Security"],
  ["Migrations", "Fluid Compute & Functions"],
] as const;
async function renameProductSkills() {
  for (const [from, to] of SKILL_RENAMES) {
    await sql`update skills set name = ${to} where category = 'product' and name = ${from}`;
    await sql`update skill_needs set name = ${to} where category = 'product' and name = ${from}`;
  }
  // Product skills added later (v0) get each person's sample level, unless they already have one.
  for (const [personId, ls] of Object.entries(levels)) {
    for (const [i, name] of productSkills.entries()) {
      await sql`insert into skills (person_id, category, name, level)
        select ${personId}, 'product', ${name}, ${ls[i]}
        where exists (select 1 from people where id = ${personId})
          and not exists (select 1 from skills where person_id = ${personId} and category = 'product' and name = ${name})`;
    }
  }
}

// The manager is the one real name in the demo (the person presenting it). The id
// stays "jordan-hayes" so links, sign-ins and history keep working.
async function renameManager() {
  await sql`update people set name = 'Nils Thomsen' where id = ${MANAGER} and name = 'Jordan Hayes'`;
  await sql`update dev_plans set next_step = replace(next_step, 'Jordan''s leave', 'Nils''s leave') where next_step like '%Jordan''s leave%'`;
}

// Sample "Next focus" items for databases seeded before that status existed.
// Only runs while nobody has one, and only flips items still at not started.
async function seedNextFocus() {
  const [{ count }] = await sql`select count(*)::int as count from skills where status = 'next_focus'`;
  if (count > 0) return;
  await sql`update skills set status = 'next_focus' where status = 'not_started' and (
    (person_id = 'hannah-kim' and name = 'AWS Solutions Architect Associate') or
    (person_id = 'liam-oconnor' and name = 'Champion Building') or
    (person_id = 'mei-chen' and name = 'Value Engineering (PSD)'))`;
}

// Close quarters used to be calendar "Q4", "Q1", "Q2" meaning this quarter, next
// and the one after. Move them onto the fiscal year, keeping that meaning.
async function moveDealsToFiscalQuarters() {
  const [now, next, after] = [0, 1, 2].map((n) => fiscalQuarter(new Date(), n));
  await sql`update deals set close_quarter = case close_quarter when 'Q4' then ${now} when 'Q1' then ${next} else ${after} end
    where close_quarter in ('Q4', 'Q1', 'Q2')`;
}

// Adds the scorecard sample (and the deal it needs) to databases seeded before
// it existed. Only fills scorecards nobody has written yet.
async function seedDealScorecards() {
  const [id, account, ae, saId, stage, acv, quarter, next, nextOn, presalesStage, forecast] = deals[deals.length - 1];
  await sql`insert into deals ${sql({ id, account, ae, sa_id: saId, stage, acv_usd: acv, close_quarter: fiscalQuarter(new Date(), quarter), next_step: next, next_step_on: day(nextOn), presales_stage: presalesStage, forecast })}
    on conflict (id) do nothing`;
  for (const [dealId, deliverables, comment] of dealScorecards) {
    await sql`update deals set deliverables = ${[...deliverables]}, sa_comment = ${comment} where id = ${dealId} and sa_comment is null and deliverables = '{}'`;
  }
}

// Adds Daniel's management training plan to databases seeded before it existed.
async function seedManagementTraining() {
  const [personId, goal, target, next, due, status] = devPlans.find((p) => p[1] === "Complete management training")!;
  await sql`insert into dev_plans (person_id, goal, target_level, next_step, due_on, status, updated_at)
    select ${personId}, ${goal}, ${target}, ${next}, ${day(due)}, ${status}, now() - interval '1 day'
    where not exists (select 1 from dev_plans where person_id = ${personId} and goal = ${goal})`;
}

async function seedCareerGoals() {
  for (const [personId, goal, note] of careerGoals) {
    await sql`insert into career_goals ${sql({ person_id: personId, goal, note, updated_by: personId })}`;
  }
}

// ---------- Library ----------
// Reference architectures and demo assets, written by the SAs whose achievements
// mention them (Aiko's agent architecture, Sofia's migration playbook...).
const architectures = [
  {
    id: "incremental-migration",
    title: "Incremental migration from a monolith",
    summary: "Vercel in front of the whole domain on day one; journeys move across one at a time.",
    problem: "A monolith serves server-rendered templates with some React on top. A big-bang rewrite is too risky, and the business can't freeze features while it happens.",
    approach:
      "Point the production domain at Vercel first. A fallback rewrite sends every path the new app doesn't serve yet to the legacy origin, so customers see one site throughout. " +
      "Move one journey at a time, highest value first, each as its own microfrontend that its team ships independently, with a shared design system in Turborepo. " +
      "Global Config holds a kill switch per path, so going back to the legacy page is a dashboard change rather than a deploy, and Rolling Releases puts each journey in front of 5% of traffic before it goes to everyone.",
    when_to_use: "Several teams, a migration measured in quarters, and journeys with clear URL boundaries.",
    watch_outs:
      "Sessions don't cross domains, so move them to a shared store before the first journey goes live. Rewrites are limited to 1,024 routes per deployment; use Routing Middleware beyond that. Keep URLs, canonicals and redirects identical so search rankings don't move.",
    products: ["Next.js", "Microfrontends", "Rewrites", "Global Config", "Rolling Releases", "Skew Protection"],
    author_id: "sofia-rossi",
  },
  {
    id: "peak-traffic-booking",
    title: "Booking and checkout at peak demand",
    summary: "Cache everything that's the same for everyone; protect and scale the parts that aren't.",
    problem: "Traffic spikes at known moments, such as a sale or check-in opening, slow booking down and overload the database and partner APIs. Bots scrape fares and hold inventory.",
    approach:
      "Content pages (destinations, offers, products) use ISR: served from the CDN and purged by tag when the CMS publishes. " +
      "Search and fares are an API cached at the CDN for a few seconds with stale-while-revalidate, and its calls to the inventory system sit in the Runtime Cache. " +
      "Booking and payment are never cached: Fluid compute scales them and reuses database connections, and BotID plus WAF rate limits keep bots out. Changes ship behind Rolling Releases and are promoted on conversion.",
    when_to_use: "Predictable spikes, read-heavy search in front of a slow or rate-limited backend, and bot pressure on high-value routes.",
    watch_outs:
      "Never cache a response that sets a cookie or varies by user. Load test with the real spike shape before the event, not after. Size the database pool for Fluid compute's concurrency.",
    products: ["ISR", "CDN cache", "Runtime Cache", "Fluid compute", "BotID", "WAF", "Rolling Releases"],
    author_id: "daniel-okafor",
  },
  {
    id: "ai-service-agent",
    title: "AI customer service agent",
    summary: "Answers and actions on the customer's own bookings, with a person approving anything that moves money.",
    problem: "Contact-centre volume spikes during disruption. Customers want to change a booking themselves, not just read an FAQ, and the business needs control over cost and risk.",
    approach:
      "A Next.js chat surface uses the AI SDK to stream answers and call tools against the customer's own bookings through existing APIs. " +
      "AI Gateway routes to the primary model with a fallback provider and tags spend per feature. " +
      "Anything that moves money, such as a refund or a paid rebooking, runs as a Workflow that waits for a staff approval and survives slow partner APIs. BotID guards the chat endpoint so bots can't run up inference cost.",
    when_to_use: "High-volume, repeatable requests that already have an API behind them.",
    watch_outs:
      "Start with read-only answers, then add one action at a time. Measure deflection and handle time from day one. Keep a person in the loop for refunds until the numbers say otherwise.",
    products: ["AI SDK", "AI Gateway", "Workflows", "BotID", "Observability"],
    author_id: "aiko-tanaka",
  },
  {
    id: "agentic-internal-tool",
    title: "Internal tool with an agent (SA Team Hub)",
    summary: "One data layer for a dashboard and an agent, cached by who may see what.",
    problem: "The team's plan lives in spreadsheets that nobody keeps up to date.",
    approach:
      "A Next.js dashboard and an eve agent share one data layer, with access rules next to the SQL. " +
      "Shared data sits in the Runtime Cache, personal pages are cached only in the viewer's browser, and published content (this Library) is prerendered and served from the CDN behind the sign-in proxy. " +
      "Long-running steps such as promotion cases run as Workflows, and AI Gateway tracks spend per person and feature.",
    when_to_use: "Internal tools where people would rather ask than fill in forms.",
    watch_outs: "Check access in the data layer, not only the UI. Never put personal data in a shared cache.",
    products: ["Next.js Cache Components", "eve", "AI SDK", "AI Gateway", "Workflows", "Routing Middleware"],
    author_id: MANAGER,
  },
];

const demoAssets = [
  { id: "migration-pov-playbook", title: "Migration POV playbook", kind: "playbook", description: "Three-week proof of value: scope, success criteria, timeline and watch-outs.", href: "/files/migration-pov-playbook.pdf", architecture_id: "incremental-migration", author_id: "sofia-rossi" },
  { id: "peak-load-demo-script", title: "Peak load demo script", kind: "demo_script", description: "Ten minutes: cache MISS then HIT, a 300 ms purge, a load test, bots blocked, a 5% rollout.", href: "/files/peak-load-demo-script.pdf", architecture_id: "peak-traffic-booking", author_id: "daniel-okafor" },
  { id: "ai-agent-demo-script", title: "AI service agent demo script", kind: "demo_script", description: "Twelve minutes: answers, a rebooking, a refund waiting for approval, and spend in AI Gateway.", href: "/files/ai-agent-demo-script.pdf", architecture_id: "ai-service-agent", author_id: "aiko-tanaka" },
  { id: "caching-cheat-sheet", title: "Caching on Vercel cheat sheet", kind: "cheat_sheet", description: "The four caching layers on one page, and when to use each.", href: "/files/caching-cheat-sheet.pdf", architecture_id: "peak-traffic-booking", author_id: "priya-nair" },
  { id: "hub-architecture", title: "SA Team Hub architecture", kind: "diagram", description: "One-page architecture of this app.", href: "/files/sa-team-hub-architecture.pdf", architecture_id: "agentic-internal-tool", author_id: MANAGER },
  { id: "hub-flows", title: "SA Team Hub request flows", kind: "diagram", description: "Numbered flows for sign-in, chat, caching and the Friday digest.", href: "/files/sa-team-hub-flows.pdf", architecture_id: "agentic-internal-tool", author_id: MANAGER },
] as const;

// [item, deal, used by, days ago]: where the team has already reused each item.
const libraryUses = [
  ["incremental-migration", "D-1002", "sofia-rossi", -40],
  ["incremental-migration", "D-1001", "priya-nair", -25],
  ["migration-pov-playbook", "D-1002", "sofia-rossi", -38],
  ["migration-pov-playbook", "D-1001", "priya-nair", -24],
  ["peak-traffic-booking", "D-1005", "daniel-okafor", -30],
  ["peak-traffic-booking", "D-1002", "sofia-rossi", -12],
  ["peak-load-demo-script", "D-1005", "daniel-okafor", -28],
  ["caching-cheat-sheet", "D-1001", "priya-nair", -20],
  ["caching-cheat-sheet", "D-1010", "jack-wilson", -9],
  ["ai-service-agent", "D-1004", "jack-wilson", -6],
  ["ai-service-agent", "D-1009", "hannah-kim", -8],
  ["ai-service-agent", "D-1014", "priya-nair", -15],
  ["ai-service-agent", "D-1015", "aiko-tanaka", -10],
  ["ai-agent-demo-script", "D-1009", "hannah-kim", -11],
  ["ai-agent-demo-script", "D-1015", "aiko-tanaka", -9],
] as const;

// Runs on every setup: fills the Library when it is empty, so already-seeded databases get it too.
async function seedLibrary() {
  const [{ count }] = await sql`select count(*)::int as count from reference_architectures`;
  if (count > 0) return;
  await sql`insert into reference_architectures ${sql(architectures)}`;
  await sql`insert into demo_assets ${sql(demoAssets.map((a) => ({ ...a })))}`;
  await sql`insert into library_uses ${sql(libraryUses.map(([itemId, dealId, usedBy, offset]) => ({ item_id: itemId, deal_id: dealId, used_by: usedBy, used_on: day(offset) })))}`;
  console.log("Added the sample Library.");
}

// ---------- Compete ----------
// Battlecards for the three competitors Vercel publishes the most comparisons against
// (or, for AWS, the one customers default to). Facts come from each competitor's own
// docs and pricing pages; claims from Vercel's comparison guides are labelled as such.
// Reviewed 26 Oct 2026: re-check the sources before relying on a number.
const battlecards = [
  {
    id: "netlify",
    competitor: "Netlify",
    positioning: "Closest to us on developer experience, with broad Next.js support. Win on running Next.js where it's built, on long AI work, and on the platform around it.",
    they_win: [
      "Simple pricing: Pro is $20 a month on credits that cover deploys, compute, bandwidth, requests and forms.",
      "Extras teams like: built-in forms, a database branch per preview, Azure DevOps and self-hosted Git, and Agent Runners that run Claude Code, Codex or Gemini from the dashboard.",
      "Often already hosts the marketing or content site, so it's the incumbent.",
      "Its OpenNext-based adapter lists App Router, streaming, ISR and Cache Components as supported.",
    ],
    we_win: [
      "Native, not adapted: Netlify translates the Next.js build with an adapter, and new features land on Vercel first. Netlify's adapter for the new Next.js Adapter API is still in development.",
      "Long AI and booking work: Netlify caps synchronous functions at 60 seconds (Vercel's guide); Vercel allows up to 800 seconds on Pro and Enterprise, and Fluid compute bills CPU only while code runs, not while it waits on a model.",
      "Middleware runs on Netlify's Deno Edge Functions with a 50 ms CPU limit (Vercel's guide), and Netlify's docs say headers and redirects run after middleware, unlike standard Next.js.",
      "Cache purges reach every region in about 300 ms on Vercel; Vercel's guide puts Netlify at a few seconds.",
      "AI Gateway is generally available with provider fallbacks and spend per feature; Netlify's AI Gateway is labelled beta. Workflow, Queues and Cron cover background work.",
    ],
    questions: [
      "Do any routes run long, such as AI answers, searches across partners or report generation?",
      "Which Next.js features do you want in the next year, and how soon after they ship?",
      "Is this decision about the marketing site, or about booking and check-in?",
      "Do any rewrites point at files in public, or rely on headers set before middleware?",
    ],
    objections: [
      { objection: "Netlify supports Next.js fully now.", answer: "It supports most of it, and it's fair to say so. The difference is the adapter in between and the timing. Ask for their end-to-end test report on your Next.js version, and compare both on a POV with your own app." },
      { objection: "We already use Netlify for the marketing site.", answer: "Keep it. Start with the journey that hurts at peak, behind the same domain with a rewrite, and decide the rest on the numbers." },
      { objection: "Netlify Pro is a flat $20 with unlimited members.", answer: "True, and good for small teams. At enterprise scale both are negotiated, so compare the workload: requests and compute at peak, plus time spent working around gaps." },
    ],
    proof: ["incremental-migration", "migration-pov-playbook", "ai-service-agent", "caching-cheat-sheet"],
    sources: [
      { label: "Netlify: Next.js on Netlify", url: "https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/" },
      { label: "Netlify: the Next.js Adapter API", url: "https://www.netlify.com/blog/the-next-js-adapter-api-just-shipped-here-s-what-comes-next/" },
      { label: "Netlify: credit-based pricing", url: "https://www.netlify.com/blog/new-pricing-credits/" },
      { label: "Netlify: Agent Runners and AI Gateway (beta)", url: "https://www.netlify.com/changelog/new-ai-workflows-agent-runners-and-ai-gateway-beta/" },
      { label: "Vercel's guide: Next.js on Vercel vs Netlify", url: "https://vercel.com/kb/guide/nextjs-on-vercel-vs-netlify" },
    ],
    owner_id: "sofia-rossi",
  },
  {
    id: "cloudflare",
    competitor: "Cloudflare",
    positioning: "The network and security heavyweight, now going after Next.js apps with vinext. Win on running Next.js fully with nothing to assemble; don't pick a fight on network size.",
    they_win: [
      "Network scale: 330+ cities in 100+ countries, and more capacity to absorb the largest DDoS attacks (Vercel's own WAF guide says so).",
      "Security depth: numeric bot scores, the full OWASP Core Rule Set with paranoia levels, leaked-credential checks, account-wide policies, and protection for any origin.",
      "Price at volume: Workers Paid is $5 a month with 10 million requests, and R2 has no egress fees.",
      "Workers run in every location by default, on fast-starting isolates.",
    ],
    we_win: [
      "All of Next.js: Cloudflare's OpenNext adapter doesn't support Node.js middleware, and lists PPR and \"use cache\" as experimental. vinext is experimental, and Cloudflare says it isn't battle-tested at scale.",
      "Nothing to assemble: on Cloudflare you build the Next.js cache from R2, Durable Objects and D1. On Vercel, ISR and the CDN work with no configuration and purge globally in about 300 ms.",
      "Room to run: up to 4 GB of memory and 800 seconds per function on Vercel, against 128 MB per isolate and a 10 MB bundle on Workers Paid (Vercel's guide).",
      "A framework-aware firewall: rules target routes like /blog/[slug], reach every region in under 300 ms, and live in code with the app.",
      "One platform: no second CDN in front of another host, and no extra hop.",
    ],
    questions: [
      "Does your app use Node.js middleware, Cache Components or long-running routes?",
      "Who will own the cache wiring across R2, Durable Objects and D1, and its upgrades?",
      "How much memory do your heaviest routes need, such as image or PDF work and AI calls?",
      "Is Cloudflare already proxying the site? That's a second CDN hop in front of any host, so plan where the WAF rules live.",
    ],
    objections: [
      { objection: "Cloudflare's network is bigger.", answer: "It is. For an app, what matters is time to first byte from where the data lives, and how fast a change reaches users. Measure both on a POV." },
      { objection: "vinext runs our Next.js app on Workers.", answer: "It's experimental, and Cloudflare says it isn't battle-tested at scale. Ask what happens to your roadmap when Next.js ships something vinext hasn't rebuilt yet." },
      { objection: "Workers is cheaper.", answer: "Often, per request. Add the engineering time to assemble caching and to fit within 128 MB and the bundle limit, then compare on your workload." },
    ],
    proof: ["peak-traffic-booking", "peak-load-demo-script", "caching-cheat-sheet"],
    sources: [
      { label: "Cloudflare: Next.js on Workers (OpenNext)", url: "https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/" },
      { label: "IT Brief: Cloudflare unveils vinext (Feb 2026)", url: "https://itbrief.com.au/story/cloudflare-unveils-vinext-a-vite-based-next-js-rival" },
      { label: "Vercel's guide: Next.js on Vercel vs Cloudflare", url: "https://vercel.com/kb/guide/next-js-on-vercel-vs-cloudflare" },
      { label: "Vercel's guide: Vercel WAF vs Cloudflare WAF", url: "https://vercel.com/kb/guide/vercel-waf-vs-cloudflare-waf" },
    ],
    owner_id: "jack-wilson",
  },
  {
    id: "aws",
    competitor: "AWS (Amplify, or build it yourself)",
    positioning: "The default when a customer is all-in on AWS. Don't fight AWS: keep their data and APIs there, and win the front end on Next.js depth, streaming AI and speed at peak.",
    they_win: [
      "It's AWS spend, on the bill and through the security review they already have.",
      "Amplify is cheap to start: 15 GB served and 500,000 SSR requests free each month, then $0.15 per GB and $0.30 per million requests.",
      "Amplify Gen 2 puts auth, data and a Bedrock AI kit in the same TypeScript repo.",
      "A platform team that already runs EKS, CloudFront and Lambda can host Next.js itself with OpenNext, in its own account.",
    ],
    we_win: [
      "Next.js on day one: Amplify's docs cover Next.js 12 to 15. Vercel runs the current release, Cache Components included.",
      "Streaming: Amplify doesn't support Next.js streaming, so an AI assistant's answer arrives all at once. On Vercel the AI SDK streams it token by token.",
      "Instant updates: Amplify doesn't support on-demand ISR (revalidateTag, revalidatePath), so a fare or seat change waits for a timer. Vercel purges by tag globally in about 300 ms.",
      "Amplify doesn't support edge middleware, and its middleware doesn't run on static assets or optimised images.",
      "Building it yourself means owning upgrades, autoscaling, cache invalidation and CI/CD. Vercel bills active CPU, not idle nodes.",
      "AI Gateway: any model provider with fallbacks and spend per feature, next to Workflow for durable steps.",
    ],
    questions: [
      "Which journeys need streaming, such as an AI trip assistant or long search results?",
      "When a fare or seat price changes, how quickly must every page show it?",
      "Which Next.js version are you on, and how soon after a release do you want its features?",
      "Who runs the platform today, and what would that team build if it didn't have to?",
      "How do you roll back a bad release at peak, and how long does it take?",
    ],
    objections: [
      { objection: "We're an AWS shop and don't add vendors.", answer: "Keep the data, APIs and Bedrock in AWS: Vercel is the front end in front of them. Vercel is on AWS Marketplace, so it can go on the AWS bill, and Secure Compute gives private connectivity to your VPC on Enterprise." },
      { objection: "Amplify is cheaper.", answer: "Price the peak, not an average month: bookings lost while check-in is slow, plus engineers working around missing features. Then run a POV on your real spike." },
      { objection: "We'll self-host Next.js with OpenNext.", answer: "It works, and then you own it: CDN rules, cache invalidation, image optimisation and an upgrade on every Next.js release. Ask who keeps it current in two years." },
    ],
    proof: ["peak-traffic-booking", "peak-load-demo-script", "ai-service-agent", "ai-agent-demo-script"],
    sources: [
      { label: "AWS: Amplify support for Next.js", url: "https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html" },
      { label: "AWS: Amplify pricing", url: "https://aws.amazon.com/amplify/pricing/" },
      { label: "AWS Japan on Zenn: Next.js on AWS in 2026", url: "https://zenn.dev/aws_japan/articles/nextjs-on-aws-2026" },
      { label: "AWS: Amplify AI kit for Bedrock", url: "https://aws.amazon.com/about-aws/whats-new/2024/11/aws-amplify-full-stack-ai-kit-amazon-bedrock" },
      { label: "Vercel's guide: Vercel vs Kubernetes", url: "https://vercel.com/kb/guide/vercel-vs-kubernetes" },
      { label: "Vercel joins AWS Marketplace", url: "https://vercel.com/blog/vercel-joins-aws-marketplace" },
    ],
    owner_id: "daniel-okafor",
  },
];

// The main competitor on some deals: [deal, battlecard]. Brightside Energy is the closed win.
const dealCompetitors = [
  ["D-1005", "aws"],
  ["D-1009", "aws"],
  ["D-1002", "netlify"],
  ["D-1008", "netlify"],
  ["D-1004", "cloudflare"],
  ["D-1010", "cloudflare"],
] as const;

// Runs on every setup, like seedLibrary: fills Compete when it is empty.
async function seedCompete() {
  const [{ count }] = await sql`select count(*)::int as count from battlecards`;
  if (count > 0) return;
  await sql`insert into battlecards ${sql(battlecards.map((c) => ({ ...c, objections: sql.json(c.objections), sources: sql.json(c.sources) })))}`;
  for (const [dealId, competitor] of dealCompetitors) await sql`update deals set competitor = ${competitor} where id = ${dealId}`;
  console.log("Added the sample battlecards.");
}

// ---------- Accounts ----------
// Customers after the sale. Tasman Retail and Kiwi Freight also have open expansion
// deals; Brightside Energy is the deal closed last month. Products not listed are not in use.
// [id, account, segment, AE, SA, ARR, commit, renewal (days from today), health, note, competitor, usage trend %, using, piloting]
const customers = [
  ["bluewater-cruises", "Bluewater Cruises", "Strategic (Travel)", "Grace Liu", "daniel-okafor", 540000, 500000, 45, "watch",
    "Usage is at 96% of commit after the peak booking season, so the renewal should right-size the commit before overage starts.", null,
    [78, 82, 88, 91, 95, 96], ["Next.js", "Fluid compute", "CDN & ISR", "Firewall"], ["AI SDK"]],
  ["northshore-bank", "Northshore Bank", "Enterprise (FSI)", "Grace Liu", "priya-nair", 610000, 650000, 80, "healthy",
    "Steady growth. The AI assistant team calls models with the AI SDK but manages provider keys and spend themselves.", null,
    [70, 72, 75, 77, 80, 83], ["Next.js", "Fluid compute", "CDN & ISR", "Firewall", "BotID", "Rolling Releases", "AI SDK"], []],
  ["canopy-health", "Canopy Health", "Enterprise (Health)", "Anna Webb", "ravi-menon", 210000, 240000, 25, "at_risk",
    "Usage is down a third since the platform lead who sponsored us left in August, and one product team moved back to its old hosting.", null,
    [74, 71, 66, 58, 52, 49], ["Next.js", "Fluid compute", "CDN & ISR"], []],
  ["tasman-retail", "Tasman Retail", "Enterprise (Retail)", "Marco Silva", "sofia-rossi", 380000, 360000, 150, "healthy",
    "Phase 1 of the migration is live and usage is above commit; phase 2 is being scoped.", null,
    [62, 70, 84, 97, 104, 108], ["Next.js", "Fluid compute", "CDN & ISR", "Microfrontends", "Firewall", "v0"], []],
  ["kiwi-freight", "Kiwi Freight", "Enterprise", "Tama Ngata", "mei-chen", 120000, 120000, 100, "healthy",
    "The AI Gateway pilot is going well; the open deal takes it to production.", null,
    [55, 58, 61, 66, 70, 74], ["Next.js", "Fluid compute", "CDN & ISR", "AI SDK"], ["AI Gateway"]],
  ["lyrebird-games", "Lyrebird Games", "Telco & Media", "Ben Harris", "jack-wilson", 260000, 300000, 60, "watch",
    "Bandwidth-heavy game launches. Their platform team is pricing Cloudflare for asset delivery before the renewal.", "cloudflare",
    [88, 93, 81, 79, 76, 72], ["Next.js", "Fluid compute", "CDN & ISR", "Firewall"], ["BotID"]],
  ["brightside-energy", "Brightside Energy", "Commercial", "Liam Ford", "liam-oconnor", 95000, 95000, 330, "healthy",
    "Signed last month and onboarding; the first site goes live this quarter.", null,
    [0, 0, 0, 0, 18, 35], ["Next.js", "CDN & ISR"], ["v0"]],
] as const;

// [customer, name, title, what makes them a power user, champion status, suggested next move]
const powerUsers = [
  ["bluewater-cruises", "Mia Thompson", "Head of Digital", "Sponsors the platform and presented our peak-season results to her board.", "champion", "Ask her to be a reference for Coral Airlines and to speak at the APJ customer event."],
  ["bluewater-cruises", "Raj Patel", "Lead Engineer", "Ran the peak-season load test himself and ships about 40 deploys a week.", "potential", "Walk him through BotID: he owns bot mitigation and the renewal is close."],
  ["northshore-bank", "Olivia Chen", "Platform Lead", "Rolled Vercel out to six product teams and writes their internal guides.", "champion", "Reference call for Harbour Bank's InfoSec review."],
  ["northshore-bank", "Ethan Brooks", "Staff Engineer", "Built their AI assistant on the AI SDK.", "potential", "Show him AI Gateway's spend by feature; he's the natural champion for it."],
  ["canopy-health", "Sam Wright", "Frontend Lead", "Still deploys daily and asked for help with Core Web Vitals.", "potential", "Make Sam the new sponsor: an exec readout with their CTO before the renewal."],
  ["tasman-retail", "Chloe Martin", "Engineering Manager", "Led phase 1 of the migration with no downtime.", "champion", "Case study on phase 1, and a reference for other retail migrations."],
  ["tasman-retail", "Luca Bianchi", "Senior Engineer", "Built the shared design system across their microfrontends.", "user", null],
  ["kiwi-freight", "Aroha Walker", "CTO", "Pushed for the AI Gateway pilot and reviews its spend every week.", "potential", "Invite her to the AI customer advisory board."],
  ["lyrebird-games", "Kai Nakamura", "Head of Platform", "Owns hosting costs and is running the Cloudflare comparison.", "user", "Go through the Cloudflare battlecard with his own traffic numbers."],
  ["brightside-energy", "Noah Evans", "Developer", "Built their first site with v0 and Next.js in two weeks.", "user", null],
] as const;

// Runs on every setup, like seedLibrary: fills Accounts when it is empty.
async function seedAccounts() {
  const [{ count }] = await sql`select count(*)::int as count from customers`;
  if (count > 0) return;
  await sql`insert into customers ${sql(customers.map(([id, account, segment, ae, saId, arr, commit, renewal, health, note, competitor, trend]) => ({ id, account, segment, ae, sa_id: saId, arr_usd: arr, commit_usd: commit, renewal_on: day(renewal), health, health_note: note, competitor, usage_trend: [...trend] })))}`;
  await sql`insert into customer_products ${sql(customers.flatMap(([id, , , , , , , , , , , , using, piloting]) => ADOPTION_PRODUCTS.map((product) => ({ customer_id: id, product, status: (using as readonly string[]).includes(product) ? "using" : (piloting as readonly string[]).includes(product) ? "piloting" : "not_using" }))))}`;
  await sql`insert into power_users ${sql(powerUsers.map(([customerId, name, title, activity, champion, next]) => ({ customer_id: customerId, name, title, activity, champion, next_move: next, updated_by: MANAGER })))}`;
  console.log("Added the sample accounts.");
}

async function main() {
  await root.begin(async (tx) => {
    sql = tx as unknown as typeof root;
    await seed();
  });
}

async function seed() {
  await sql.unsafe(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

  // People with no skills and no deals means an earlier seed stopped part-way: start again.
  const [{ people: peopleCount, skills: skillCount, deals: dealCount }] = await sql`
    select (select count(*)::int from people) as people, (select count(*)::int from skills) as skills, (select count(*)::int from deals) as deals`;
  const incomplete = peopleCount > 0 && skillCount === 0 && dealCount === 0;
  if (incomplete) console.log("Found people but no other data; reseeding the demo data.");

  // Slack member ids are entered by hand on Settings, so carry them across a reset.
  let slackIds: { id: string; slack_user_id: string }[] = [];
  if (reset || incomplete) {
    slackIds = await sql`select id, slack_user_id from people where slack_user_id is not null`;
    await sql`truncate power_users, customer_products, customers, battlecards, library_uses, demo_assets, reference_architectures, talent_ratings, shoutouts, digests, deal_updates, career_goals, promotion_cases, candidates, succession, retention_risks, deals, dev_plans, achievements, skill_needs, skills, people restart identity cascade`;
  } else {
    const [{ count }] = await sql`select count(*)::int as count from people`;
    if (count > 0) {
      // Tables added after the first seed get their sample rows without wiping anything.
      const [{ goals }] = await sql`select count(*)::int as goals from career_goals`;
      if (goals === 0) {
        await seedCareerGoals();
        console.log("Added sample career goals.");
      }
      await renameEsatToPsd();
      await renameManager();
      await renameProductSkills();
      await seedNextFocus();
      await moveDealsToFiscalQuarters();
      await seedDealScorecards();
      await seedManagementTraining();
      const [{ ratings }] = await sql`select count(*)::int as ratings from talent_ratings`;
      if (ratings === 0) {
        await seedTalentRatings();
        console.log("Added sample 9-box ratings.");
      }
      await seedLibrary();
      await seedCompete();
      await seedAccounts();
      console.log("Database already seeded. Use --reset to reseed.");
      return;
    }
  }

  // One insert per table (rather than per row), so a reset over a slow connection takes seconds.
  console.log("Loading demo data…");
  await sql`insert into people ${sql(people.map((p) => ({ id: p.id, name: p.name, title: p.title, level: p.level, role: p.role, segment: p.segment, location: p.location, start_date: p.start, manager_id: p.id === MANAGER ? null : MANAGER })))}`;
  for (const { id, slack_user_id } of slackIds) {
    await sql`update people set slack_user_id = ${slack_user_id} where id = ${id}`;
  }
  if (slackIds.length > 0) console.log(`Kept ${slackIds.length} Slack member id${slackIds.length === 1 ? "" : "s"}.`);

  await sql`insert into skills ${sql(Object.entries(levels).flatMap(([personId, ls]) => ls.map((level, i) => ({ person_id: personId, category: "product", name: productSkills[i], level }))))}`;
  await sql`insert into skills ${sql(Object.entries(certs).flatMap(([personId, list]) => list.map(([name, status, done, due]) => ({ person_id: personId, category: "certification", name, status, completed_on: done === null ? null : day(done), due_on: due === null ? null : day(due) }))))}`;
  await sql`insert into skills ${sql(Object.entries(enablement).flatMap(([personId, list]) => list.map((status, i) => ({ person_id: personId, category: "enablement", name: enablementItems[i], status, completed_on: status === "complete" ? day(-30 - i * 20) : null }))))}`;
  await sql`insert into skill_needs ${sql(skillNeeds)}`;

  await sql`insert into achievements ${sql(achievements.map(([personId, offset, category, title, impact]) => ({ person_id: personId, occurred_on: day(offset), category, title, impact, logged_by: personId })))}`;
  await sql`insert into dev_plans ${sql(devPlans.map(([personId, goal, target, next, due, status]) => ({ person_id: personId, goal, target_level: target, next_step: next, due_on: day(due), status })))}`;
  // Daniel's training plan is older than his main plan, so the main plan stays the one the agent edits.
  await sql`update dev_plans set updated_at = now() - interval '1 day' where goal = 'Complete management training'`;
  await seedCareerGoals();
  await seedTalentRatings();
  await sql`insert into deals ${sql(deals.map(([id, account, ae, saId, stage, acv, quarter, next, nextOn, presalesStage, forecast]) => ({ id, account, ae, sa_id: saId, stage, acv_usd: acv, close_quarter: fiscalQuarter(new Date(), quarter), next_step: next, next_step_on: day(nextOn), presales_stage: presalesStage, forecast })))}`;
  await seedDealScorecards();
  await sql`insert into retention_risks ${sql(retention.map(([personId, risk, reason, plan]) => ({ person_id: personId, risk, reason, action_plan: plan, updated_by: MANAGER })))}`;
  await sql`insert into succession ${sql(succession.map(([roleName, candidate, kind, personId, readiness, pros, cons]) => ({ role_name: roleName, candidate, kind, person_id: personId, readiness, pros, cons })))}`;
  await sql`insert into candidates ${sql(candidates.map(([name, currentJob, focus, stage, contact, source, notes]) => ({ name, current_job: currentJob, focus, stage, last_contact: day(contact), source, notes })))}`;

  await seedLibrary();
  await seedCompete();
  await seedAccounts();
  console.log(`Done: seeded ${people.length} people and their demo data.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => root.end());
