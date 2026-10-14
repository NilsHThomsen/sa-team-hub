import { callSlackApi } from "eve/channels/slack";
import { db } from "./db";
import type { Shoutout } from "./data";
import { slackCredentials } from "./slack";

// Glue between the shout-out workflow and the two places a recipient answers
// it (the home page and the agent). The database row is the source of truth;
// the webhook only tells the waiting workflow to look now instead of at its
// next scheduled check.

/** Where this deployment is reachable, for webhook URLs eve hands out as paths. */
export function appOrigin(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

/**
 * Wakes the workflow waiting on a shout-out. Never throws: if the call fails
 * (say a protected preview deployment refuses it), the workflow still sees the
 * decision at its next check.
 */
export async function wakeShoutoutWorkflow(webhookUrl: string | null, origin = appOrigin()): Promise<boolean> {
  if (!webhookUrl) return false;
  const headers: Record<string, string> = { "content-type": "application/json" };
  // Lets the call through Vercel Deployment Protection on preview deployments.
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers["x-vercel-protection-bypass"] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  try {
    const response = await fetch(new URL(webhookUrl, origin), { method: "POST", headers, body: "{}" });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * DMs the recipient in Slack, if their account is linked, so they can accept
 * by replying to the bot. Returns what happened for the sender's summary.
 */
export async function notifyRecipientOnSlack(shoutout: Shoutout): Promise<"sent" | "not linked" | `failed: ${string}`> {
  const [person] = await db()<{ slack_user_id: string | null }[]>`select slack_user_id from people where id = ${shoutout.to_person}`;
  if (!person?.slack_user_id) return "not linked";
  const text =
    `:tada: *${shoutout.from_name} sent you a shout-out:* ${shoutout.title}\n>${shoutout.message}\n\n` +
    `Reply *accept* to add it to your achievements doc, or *decline* to leave it out. You can also answer from Action items on the SA Team Hub home page.`;
  try {
    const response = await callSlackApi({ botToken: slackCredentials.botToken, operation: "chat.postMessage", body: { channel: person.slack_user_id, text } });
    return response.ok ? "sent" : `failed: ${String(response.error)}`;
  } catch (err) {
    return `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
