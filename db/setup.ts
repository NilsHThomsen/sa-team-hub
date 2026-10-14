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
import { fiscalQuarter } from "../agent/lib/fiscal.ts"; // .ts: db:setup runs under plain node

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
// Every Vercel build runs this, so a deploy brings the database up to date on its own.
// A build with no real database (a local build, or a pulled env file with hidden values) just skips it.
if (process.argv.includes("--if-configured") && !url?.startsWith("postgres")) {
  console.log("No database configured; skipping db setup.");
  process.exit(0);
}
if (!url) throw new Error("Set DATABASE_URL (or POSTGRES_URL) first.");

const sql = postgres(url, { ssl: url.includes("localhost") ? false : "require", max: 1, onnotice: () => {} });
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

const productSkills = ["Next.js & Rendering", "Caching & CDN", "AI SDK & Agents", "Security & Compliance", "Migrations", "Observability"];
// Levels per person in productSkills order: 0 None, 1 Elevator, 2 Present, 3 Demo, 4 Prove (see agent/lib/skill-levels.ts).
const levels: Record<string, number[]> = {
  "priya-nair": [4, 3, 3, 4, 3, 3],
  "tom-becker": [2, 2, 1, 3, 2, 2],
  "aiko-tanaka": [4, 4, 4, 3, 4, 3],
  "liam-oconnor": [3, 2, 2, 1, 2, 1],
  "sofia-rossi": [3, 3, 2, 2, 4, 2],
  "ravi-menon": [3, 3, 2, 4, 3, 3],
  "hannah-kim": [2, 1, 2, 1, 0, 1],
  "jack-wilson": [3, 4, 3, 2, 3, 4],
  "mei-chen": [3, 2, 3, 2, 1, 2],
  "daniel-okafor": [4, 3, 2, 3, 4, 3],
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
  { category: "product", name: "AI SDK & Agents", min_level: 3, min_people: 5, reason: "Agent and AI Cloud deals make up a growing share of next quarter's APJ pipeline." },
  { category: "product", name: "Caching & CDN", min_level: 3, min_people: 5, reason: "Most migration POCs are judged on Core Web Vitals and cache hit ratio." },
  { category: "product", name: "Security & Compliance", min_level: 3, min_people: 4, reason: "FSI and Public Sector security reviews need a deep SA in the room." },
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

async function seedCareerGoals() {
  for (const [personId, goal, note] of careerGoals) {
    await sql`insert into career_goals ${sql({ person_id: personId, goal, note, updated_by: personId })}`;
  }
}

async function main() {
  await sql.unsafe(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));

  if (reset) {
    await sql`truncate talent_ratings, shoutouts, digests, deal_updates, career_goals, promotion_cases, candidates, succession, retention_risks, deals, dev_plans, achievements, skill_needs, skills, people restart identity cascade`;
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
      await seedNextFocus();
      await moveDealsToFiscalQuarters();
      await seedDealScorecards();
      const [{ ratings }] = await sql`select count(*)::int as ratings from talent_ratings`;
      if (ratings === 0) {
        await seedTalentRatings();
        console.log("Added sample 9-box ratings.");
      }
      console.log("Database already seeded. Use --reset to reseed.");
      return;
    }
  }

  for (const p of people) {
    await sql`insert into people ${sql({ id: p.id, name: p.name, title: p.title, level: p.level, role: p.role, segment: p.segment, location: p.location, start_date: p.start, manager_id: p.id === MANAGER ? null : MANAGER })}`;
  }

  for (const [personId, ls] of Object.entries(levels)) {
    for (const [i, level] of ls.entries()) {
      await sql`insert into skills ${sql({ person_id: personId, category: "product", name: productSkills[i], level })}`;
    }
  }
  for (const [personId, list] of Object.entries(certs)) {
    for (const [name, status, done, due] of list) {
      await sql`insert into skills ${sql({ person_id: personId, category: "certification", name, status, completed_on: done === null ? null : day(done), due_on: due === null ? null : day(due) })}`;
    }
  }
  for (const [personId, list] of Object.entries(enablement)) {
    for (const [i, status] of list.entries()) {
      await sql`insert into skills ${sql({ person_id: personId, category: "enablement", name: enablementItems[i], status, completed_on: status === "complete" ? day(-30 - i * 20) : null })}`;
    }
  }
  for (const n of skillNeeds) await sql`insert into skill_needs ${sql(n)}`;

  for (const [personId, offset, category, title, impact] of achievements) {
    await sql`insert into achievements ${sql({ person_id: personId, occurred_on: day(offset), category, title, impact, logged_by: personId })}`;
  }
  for (const [personId, goal, target, next, due, status] of devPlans) {
    await sql`insert into dev_plans ${sql({ person_id: personId, goal, target_level: target, next_step: next, due_on: day(due), status })}`;
  }
  await seedCareerGoals();
  await seedTalentRatings();
  for (const [id, account, ae, saId, stage, acv, quarter, next, nextOn, presalesStage, forecast] of deals) {
    await sql`insert into deals ${sql({ id, account, ae, sa_id: saId, stage, acv_usd: acv, close_quarter: fiscalQuarter(new Date(), quarter), next_step: next, next_step_on: day(nextOn), presales_stage: presalesStage, forecast })}`;
  }
  await seedDealScorecards();
  for (const [personId, risk, reason, plan] of retention) {
    await sql`insert into retention_risks ${sql({ person_id: personId, risk, reason, action_plan: plan, updated_by: MANAGER })}`;
  }
  for (const [roleName, candidate, kind, personId, readiness, pros, cons] of succession) {
    await sql`insert into succession ${sql({ role_name: roleName, candidate, kind, person_id: personId, readiness, pros, cons })}`;
  }
  for (const [name, currentJob, focus, stage, contact, source, notes] of candidates) {
    await sql`insert into candidates ${sql({ name, current_job: currentJob, focus, stage, last_contact: day(contact), source, notes })}`;
  }

  console.log(`Seeded ${people.length} people.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
