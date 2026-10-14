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
  listCareerGoals,
  setCareerGoal,
  getModelSetting,
  setPrimaryModel,
  setSlackLink,
  setRetentionRisk,
  skillGaps,
  createShoutout,
  decideShoutout,
  expireShoutout,
  getShoutout,
  listPendingShoutoutsFor,
  listSentShoutouts,
  recordAcceptedShoutout,
} from "../agent/lib/data";
import { wakeShoutoutWorkflow } from "../agent/lib/shoutouts";
import { db } from "../agent/lib/db";
import { DEFAULT_MODEL, primaryModel } from "../agent/lib/models";
import { actionItems } from "../agent/lib/actions";
import { postDigestToSlack } from "../agent/lib/slack";
import { slackAuthFor } from "../agent/lib/slack-auth";
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

describe("career goals", () => {
  test("an IC sees and changes only their own goal", async () => {
    const mine = await listCareerGoals(priya);
    assert.deepEqual(mine.map((g) => g.person_id), ["priya-nair"]);
    const row = await setCareerGoal(priya, { personId: "priya-nair", goal: "Field CTO" });
    assert.equal(row.goal, "Field CTO");
    assert.equal(row.note, "Wants to stay hands-on and lead strategic FSI accounts."); // note kept when not given
    assert.equal(row.updated_by_name, "Priya Nair");
    await assert.rejects(setCareerGoal(priya, { personId: "tom-becker", goal: "Manager" }), AccessDenied);
    await setCareerGoal(priya, { personId: "priya-nair", goal: "Principal SA" });
  });

  test("a manager sees every SA and can change anyone's goal", async () => {
    assert.equal((await listCareerGoals(manager)).length, 10);
    const row = await setCareerGoal(manager, { personId: "tom-becker", goal: "Manager", note: "Asked about leading the Canberra pod." });
    assert.equal(row.updated_by_name, "Jordan Hayes");
    await setCareerGoal(manager, { personId: "tom-becker", goal: "Senior SA", note: "" });
  });

  test("only listed goals, only for SAs, only by a person", async () => {
    await assert.rejects(setCareerGoal(manager, { personId: "tom-becker", goal: "Astronaut" }), /not a career goal/);
    await assert.rejects(setCareerGoal(manager, { personId: "jordan-hayes", goal: "Manager" }), /tracked for SAs/);
    await assert.rejects(setCareerGoal(app, { personId: "tom-becker", goal: "Manager" }), AccessDenied);
  });
});

describe("primary model setting", () => {
  test("only a manager can choose the model, and only from the list", async () => {
    await assert.rejects(setPrimaryModel(priya, "anthropic/claude-opus-5.5"), AccessDenied);
    await assert.rejects(setPrimaryModel(app, "anthropic/claude-opus-5.5"), AccessDenied);
    await assert.rejects(getModelSetting(priya), AccessDenied);
    await assert.rejects(setPrimaryModel(manager, "someone/made-up-model"), /not one of the models/);
  });

  test("the chosen model is what new sessions and workflows read", async () => {
    const saved = await setPrimaryModel(manager, "anthropic/claude-opus-5.5");
    assert.equal(saved.updated_by_name, "Jordan Hayes");
    assert.equal(await primaryModel(), "anthropic/claude-opus-5.5");
    await setPrimaryModel(manager, DEFAULT_MODEL);
    assert.equal(await primaryModel(), DEFAULT_MODEL);
  });
});

describe("Slack access", () => {
  after(async () => {
    await db()`update people set slack_user_id = null where id in ('jordan-hayes', 'priya-nair')`;
  });

  test("only a manager can link Slack accounts, and only valid member ids", async () => {
    await assert.rejects(setSlackLink(priya, "priya-nair", "U0PRIYA01"), AccessDenied);
    await assert.rejects(setSlackLink(manager, "priya-nair", "not-an-id"), /Slack member ID/);
    await setSlackLink(manager, "priya-nair", "u0priya01"); // stored upper-case
    await setSlackLink(manager, "jordan-hayes", "U0JORDAN1");
  });

  test("unlinked Slack members get nothing", async () => {
    assert.equal(await slackAuthFor("U0STRANGER", "D0123456"), null);
    assert.equal(await slackAuthFor(undefined, "D0123456"), null);
  });

  test("a manager keeps manager access in a DM but not in a shared channel", async () => {
    const dm = actorFromAuth(await slackAuthFor("U0JORDAN1", "D0123456"));
    assert.equal(dm.kind === "user" && dm.role, "manager");
    await listRetentionRisks(dm);

    const shared = actorFromAuth(await slackAuthFor("U0JORDAN1", "C0123456"));
    assert.equal(shared.kind === "user" && shared.role, "ic");
    await assert.rejects(listRetentionRisks(shared), AccessDenied);
    assert.ok((await listDevPlans(shared)).every((p) => p.person_id === "jordan-hayes"));
  });

  test("an SA in Slack has exactly their web-app access", async () => {
    const sa = actorFromAuth(await slackAuthFor("U0PRIYA01", "D0999999"));
    assert.deepEqual(sa, { kind: "user", personId: "priya-nair", name: "Priya Nair", role: "ic" });
  });
});

describe("digest to Slack", () => {
  test("saving works without Slack set up, and says so", async () => {
    delete process.env.SLACK_DIGEST_CHANNEL;
    const digest = await saveDigest(manager, "Wins this week: test digest body long enough to save.");
    assert.equal(digest.slack_ts, null);
    assert.equal(await postDigestToSlack(digest, "body"), "not configured");
  });
});

describe("action items", () => {
  test("an SA only gets items about themselves", async () => {
    const items = await actionItems(priya);
    assert.ok(items.length > 0);
    assert.ok(items.every((i) => i.personId === "priya-nair"));
    assert.ok(!items.some((i) => i.kind === "retention" || i.kind === "approval"));
  });

  test("a manager gets team items, including overdue plans and forecast mismatches", async () => {
    const items = await actionItems(manager);
    assert.ok(items.some((i) => i.kind === "dev_plan" && i.title.includes("Tom Becker")));
    assert.ok(items.some((i) => i.title.includes("Kiwi Freight")));
    assert.ok(items[0].urgent); // urgent first
  });

  test("the scheduled app principal gets none", async () => {
    assert.deepEqual(await actionItems(app), []);
  });
});

describe("shout-outs", () => {
  const hannah: Actor = { kind: "user", personId: "hannah-kim", name: "Hannah Kim", role: "ic" };
  const input = { toPersonId: "hannah-kim", category: "customer", title: "Test shout-out", message: "Jumped in on a demo at short notice." };
  after(async () => {
    await db()`delete from shoutouts where idempotency_key like 'test-shoutout-%'`;
    await db()`delete from achievements where idempotency_key like 'shoutout:%' and title like '%Test shout-out%'`;
  });

  test("nobody can send one to themselves", async () => {
    await assert.rejects(createShoutout(hannah, input, "test-shoutout-self"), AccessDenied);
  });

  test("sending is idempotent and nothing reaches the achievements doc until accepted", async () => {
    const first = await createShoutout(priya, input, "test-shoutout-1");
    const again = await createShoutout(priya, input, "test-shoutout-1");
    assert.equal(first.id, again.id);
    assert.equal(first.status, "pending");
    assert.equal(await recordAcceptedShoutout(first.id), null);
    assert.ok((await listPendingShoutoutsFor(hannah)).some((s) => s.id === first.id));
    assert.ok(!(await listPendingShoutoutsFor(priya)).some((s) => s.id === first.id));
    assert.ok((await listSentShoutouts(priya)).some((s) => s.id === first.id));
    const items = await actionItems(hannah);
    assert.equal(items[0].kind, "shoutout");
    assert.equal(items[0].shoutoutId, first.id);
  });

  test("only the recipient can answer, managers included", async () => {
    const { id } = await createShoutout(priya, input, "test-shoutout-2");
    await assert.rejects(decideShoutout(priya, id, true), AccessDenied);
    await assert.rejects(decideShoutout(manager, id, true), AccessDenied);
    await assert.rejects(decideShoutout(app, id, true), AccessDenied);
  });

  test("accepting writes one achievement, logged by the sender", async () => {
    const { id } = await createShoutout(priya, input, "test-shoutout-3");
    assert.equal((await decideShoutout(hannah, id, true)).status, "accepted");
    assert.equal((await decideShoutout(hannah, id, false)).status, "accepted"); // a second answer changes nothing
    const first = await recordAcceptedShoutout(id);
    const replay = await recordAcceptedShoutout(id);
    assert.ok(first);
    assert.equal(first.achievementId, replay?.achievementId);
    const wins = await listAchievements(hannah);
    const win = wins.find((a) => a.id === first.achievementId);
    assert.equal(win?.title, "Shout-out from Priya Nair: Test shout-out");
    assert.equal(win?.logged_by, "priya-nair");
  });

  test("declined and expired shout-outs never become achievements", async () => {
    const declined = await createShoutout(priya, input, "test-shoutout-4");
    await decideShoutout(hannah, declined.id, false);
    assert.equal(await recordAcceptedShoutout(declined.id), null);
    const expired = await createShoutout(priya, input, "test-shoutout-5");
    await expireShoutout(expired.id);
    assert.equal((await getShoutout(expired.id))?.status, "expired");
    assert.equal(await recordAcceptedShoutout(expired.id), null);
  });

  test("waking the workflow never throws, even with nothing listening", async () => {
    assert.equal(await wakeShoutoutWorkflow(null), false);
    assert.equal(await wakeShoutoutWorkflow("/.well-known/workflow/v1/webhook/nothing", "http://127.0.0.1:9"), false);
  });
});
