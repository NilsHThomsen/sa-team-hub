import { defineWorkflowTool } from "eve/tools";
import { createWebhook, sleep } from "workflow";
import { z } from "zod";
import { actorFromAuth } from "../lib/actor";
import { createShoutout, expireShoutout, findPerson, getShoutout, recordAcceptedShoutout, SHOUTOUT_CATEGORIES, setShoutoutWebhook } from "../lib/data";
import { notifyRecipientOnSlack } from "../lib/shoutouts";

// Why a workflow: a shout-out needs the recipient's say before it lands in their
// achievements doc, and they might answer in a minute or next week. The run
// parks on a webhook (and a slow timer as a backstop) and holds no compute
// while it waits. Each "use step" is checkpointed, so a redeploy mid-wait
// resumes where it left off and never creates the shout-out twice.

const CHECK_EVERY = "6h"; // backstop in case the webhook call never arrives
const CHECKS = 28; // 28 x 6h = 7 days, then the shout-out expires

export default defineWorkflowTool({
  description:
    "Send a shout-out to a teammate for great work. The recipient is asked to accept it (on the home page, or by DM if their Slack is linked); " +
    "only once they accept does it go into their achievements doc. Runs as a task: tell the user it was sent and is waiting for the recipient, " +
    "then carry on. Anyone signed in can send one, but not to themselves.",
  inputSchema: z.object({
    person: z.string().min(1).describe("Recipient's person id or name. Resolve names with get_team_directory first if unsure."),
    category: z.enum(SHOUTOUT_CATEGORIES).describe("Which kind of achievement it is"),
    title: z.string().min(3).max(120).describe("Short headline, e.g. 'Rescued the Harbour Bank POC demo'"),
    message: z.string().min(3).max(600).describe("What they did and why it mattered, in the sender's words"),
  }),
  label: { start: ({ person }) => `Send a shout-out to ${person}` },
  async task(input, ctx) {
    "use workflow";

    const shoutout = await create(input, ctx.session.auth.current, ctx.callId);

    // The recipient's answer (from the home page or the agent) posts to this URL.
    const decided = createWebhook();
    const slack = await announce(shoutout.id, decided.url);

    let woken = false;
    const wake = decided.then(() => {
      woken = true;
    });
    for (let check = 0; check < CHECKS; check++) {
      await (woken ? sleep(CHECK_EVERY) : Promise.race([wake, sleep(CHECK_EVERY)]));
      const status = await currentStatus(shoutout.id);
      if (status === "accepted") {
        const recorded = await record(shoutout.id);
        return { status, to: shoutout.to_name, title: shoutout.title, achievementId: recorded?.achievementId ?? null };
      }
      if (status !== "pending") return { status, to: shoutout.to_name, title: shoutout.title };
    }

    await expire(shoutout.id);
    return { status: "expired", to: shoutout.to_name, title: shoutout.title, slack };
  },
});

// ---------- Steps ----------

async function create(input: { person: string; category: string; title: string; message: string }, auth: Parameters<typeof actorFromAuth>[0], callId: string) {
  "use step";
  const actor = actorFromAuth(auth);
  const recipient = await findPerson(input.person);
  if (!recipient) throw new Error(`No one called "${input.person}" is on the team.`);
  return createShoutout(actor, { toPersonId: recipient.id, category: input.category, title: input.title, message: input.message }, callId);
}

async function announce(id: number, webhookUrl: string) {
  "use step";
  await setShoutoutWebhook(id, webhookUrl);
  const shoutout = await getShoutout(id);
  return shoutout ? notifyRecipientOnSlack(shoutout) : "not linked";
}

async function currentStatus(id: number) {
  "use step";
  return (await getShoutout(id))?.status ?? "expired";
}

async function record(id: number) {
  "use step";
  return recordAcceptedShoutout(id);
}

async function expire(id: number) {
  "use step";
  await expireShoutout(id);
}
