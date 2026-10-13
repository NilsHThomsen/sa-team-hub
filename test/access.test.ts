// Access-rule tests against a seeded database (run `npm run db:reset` first).
// These check the rules the dashboard and the agent share, in agent/lib/data.ts,
// plus the approval policies that gate manager-only tools.
import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { AccessDenied, type Actor, actorFromAuth } from "../agent/lib/actor";
import {
  addAchievement,
  dealCoverage,
  listAchievements,
  listCandidates,
  listDevPlans,
  listPromotionCases,
  listRetentionRisks,
  saveDigest,
  setRetentionRisk,
  skillGaps,
} from "../agent/lib/data";
import { db } from "../agent/lib/db";
import { managerConfirms, managerOnly } from "../agent/lib/policies";

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
