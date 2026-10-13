// Access-rule tests against a seeded database (run `npm run db:reset` first).
// These check the rules the dashboard and the agent share, in agent/lib/data.ts,
// plus the approval policies that gate manager-only tools.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { AccessDenied, type Actor, actorFromAuth } from "../agent/lib/actor";
import {
  addAchievement,
  alignmentFlag,
  dealCoverage,
  listAchievements,
  listCandidates,
  listDevPlans,
  listPromotionCases,
  listRetentionRisks,
  saveDigest,
  updateDealNextStep,
  findDeal,
  setRetentionRisk,
  skillGaps,
} from "../agent/lib/data";
import { db } from "../agent/lib/db";
import { managerConfirms, managerOnly, signedInConfirms } from "../agent/lib/policies";

const manager: Actor = { kind: "user", personId: "jordan-hayes", name: "Jordan Hayes", role: "manager" };
const priya: Actor = { kind: "user", personId: "priya-nair", name: "Priya Nair", role: "ic" };
const app: Actor = { kind: "app" };

after(() => db().end());

describe("ICs see only their own private records", () => {
  test("achievements are scoped to the IC, even when they ask for someone else", async () => {
    const own = await listAchievements(priya);
    assert.ok(own.length > 0);
    assert.ok(own.every((a) => a.person_id === "priya-nair"));
    await assert.rejects(listAchievements(priya, { personId: "tom-becker" }), AccessDenied);
  });

  test("development plans are scoped to the IC", async () => {
    const plans = await listDevPlans(priya);
    assert.ok(plans.every((p) => p.person_id === "priya-nair"));
    assert.ok((await listDevPlans(manager)).length > plans.length);
  });

  test("deal list is scoped but team summary is shared", async () => {
    const mine = await dealCoverage(priya);
    const all = await dealCoverage(manager);
    assert.ok(mine.deals.every((d) => d.sa_id === "priya-nair"));
    assert.deepEqual(mine.summary, all.summary);
  });

  test("skill gaps hide colleague names from ICs", async () => {
    const ic = await skillGaps(priya);
    assert.ok(Array.isArray(ic.myGaps));
    assert.ok(ic.gaps.every((g) => g.qualified.length === 0 && g.closest.length === 0));
    const mgr = await skillGaps(manager);
    assert.ok(mgr.gaps.some((g) => g.qualified.length > 0));
  });
});

describe("manager-only data", () => {
  for (const [name, fn] of [
    ["retention", listRetentionRisks],
    ["warm bench", listCandidates],
    ["promotion cases", listPromotionCases],
  ] as const) {
    test(`${name}: IC and app principal are refused, manager is allowed`, async () => {
      await assert.rejects(fn(priya), AccessDenied);
      await assert.rejects(fn(app), AccessDenied);
      await fn(manager);
    });
  }

  test("an IC cannot change retention risk", async () => {
    await assert.rejects(
      setRetentionRisk(priya, { personId: "mei-chen", risk: "low", reason: "x", actionPlan: "x" }),
      AccessDenied,
    );
  });

  test("the scheduled digest can write a digest but read no retention data", async () => {
    await saveDigest(app, "test digest");
    await assert.rejects(listRetentionRisks(app), AccessDenied);
  });
});

describe("writes", () => {
  const input = { occurredOn: "2026-10-01", category: "customer", title: "Test win", impact: "Test impact" };

  test("an IC cannot log a win for a colleague", async () => {
    await assert.rejects(addAchievement(priya, { ...input, personId: "tom-becker" }, `t-${Date.now()}-a`), AccessDenied);
  });

  test("replaying the same tool call does not duplicate the achievement", async () => {
    const key = `t-${Date.now()}-b`;
    const first = await addAchievement(priya, { ...input, personId: "priya-nair" }, key);
    const second = await addAchievement(priya, { ...input, personId: "priya-nair" }, key);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(first.id, second.id);
    await db()`delete from achievements where idempotency_key = ${key}`;
  });
});

describe("eve caller mapping and approval policies", () => {
  const session = (auth: object | null) => ({ session: { auth: { current: auth } } }) as never;
  const icAuth = { authenticator: "sa-team-hub", principalId: "priya-nair", principalType: "user", attributes: { role: "ic", name: "Priya Nair" } };
  const mgrAuth = { ...icAuth, principalId: "jordan-hayes", attributes: { role: "manager", name: "Jordan Hayes" } };

  test("unknown callers are refused", () => {
    assert.throws(() => actorFromAuth(null), AccessDenied);
    assert.throws(() => actorFromAuth({ authenticator: "vercel-oidc", principalId: "x", principalType: "service", attributes: {} }), AccessDenied);
  });

  test("manager-only tools are denied for ICs and allowed for managers", async () => {
    assert.equal(await managerOnly(session(mgrAuth)), "not-applicable");
    assert.equal(((await managerOnly(session(icAuth))) as { type: string }).type, "denied");
    assert.equal(await managerConfirms(session(mgrAuth)), "user-approval");
    assert.equal(((await managerConfirms(session(null))) as { type: string }).type, "denied");
  });
});

describe("CRM next-step updates", () => {
  test("an IC can update a deal they cover, once per tool call", async () => {
    const key = `t-${Date.now()}-deal`;
    const first = await updateDealNextStep(priya, { dealId: "D-1014", nextStep: "Commercial proposal with Tama on Friday", presalesStage: "tech_win" }, key);
    const replay = await updateDealNextStep(priya, { dealId: "D-1014", nextStep: "Commercial proposal with Tama on Friday", presalesStage: "tech_win" }, key);
    assert.equal(first.duplicate, false);
    assert.equal(replay.duplicate, true);
    assert.equal(first.presales_stage, "tech_win");
    assert.equal(first.misaligned, null); // Aurora is Strong Upside, so a tech win lines up
    const [{ count }] = await db()<{ count: number }[]>`select count(*)::int as count from deal_updates where idempotency_key = ${key}`;
    assert.equal(count, 1);
  });

  test("an IC cannot update a colleague's deal; a manager can", async () => {
    await assert.rejects(updateDealNextStep(priya, { dealId: "D-1003", nextStep: "Not mine to change" }, `t-${Date.now()}-x`), AccessDenied);
    const r = await updateDealNextStep(manager, { dealId: "D-1003", nextStep: "Shortlist decision due 7 Nov" }, `t-${Date.now()}-m`);
    assert.equal(r.presales_stage, "technical_validation"); // untouched when not given
    assert.match(r.misaligned ?? "", /Commit without a tech win/); // Dept. of Transport is Commit
  });

  test("exact account names win over partial matches", async () => {
    assert.equal((await findDeal("Harbour Bank"))?.id, "D-1001");
    assert.equal((await findDeal("wealth"))?.id, "D-1012");
  });

  test("CRM writes need confirmation and a signed-in person", async () => {
    const session = (auth: object | null) => ({ session: { auth: { current: auth } } }) as never;
    const icAuth = { authenticator: "sa-team-hub", principalId: "priya-nair", principalType: "user", attributes: { role: "ic", name: "Priya Nair" } };
    assert.equal(await signedInConfirms(session(icAuth)), "user-approval");
    assert.equal(((await signedInConfirms(session({ authenticator: "app", principalId: "eve:app", principalType: "runtime", attributes: {} }))) as { type: string }).type, "denied");
  });
});

describe("presales stage vs forecast", () => {
  test("a tech win must be in Strong Upside or Commit", () => {
    assert.match(alignmentFlag("tech_win", "upside") ?? "", /only Upside/);
    assert.match(alignmentFlag("tech_win", "pipeline") ?? "", /only Pipeline/);
    assert.equal(alignmentFlag("tech_win", "strong_upside"), null);
    assert.equal(alignmentFlag("tech_win", "commit"), null);
  });

  test("a Commit must already have a tech win", () => {
    assert.match(alignmentFlag("technical_validation", "commit") ?? "", /Commit without a tech win/);
    assert.equal(alignmentFlag("technical_validation", "strong_upside"), null);
  });

  test("the seeded mismatches are flagged on the deal list", async () => {
    const { deals, summary } = await dealCoverage(manager);
    const flagsFor = (id: string) => deals.find((d) => d.id === id)?.flags.join("; ") ?? "";
    assert.match(flagsFor("D-1006"), /tech win but forecast is only Upside/);
    assert.ok(summary.stage_misaligned >= 1);
  });
});
