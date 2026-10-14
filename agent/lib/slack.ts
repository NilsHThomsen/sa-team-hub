import { connectSlackCredentials } from "@vercel/connect/eve";
import { callSlackApi } from "eve/channels/slack";
import { setDigestSlackTs } from "./data";

// One Vercel Connect connector for the Slack channel and for our own posts.
// `eve add channel/slack` created it and routes Slack events to /eve/v1/slack.
export const slackCredentials = connectSlackCredentials("slack/sa-team-hub");

export type DigestPostResult = "posted" | "updated" | "not configured" | `failed: ${string}`;

/**
 * Posts the week's digest to SLACK_DIGEST_CHANNEL, or edits the earlier post if
 * this week's digest was already posted, so re-saving (or a replayed step)
 * never posts twice. Never throws: the digest is saved either way.
 */
export async function postDigestToSlack(digest: { week_of: string; slack_ts: string | null }, body: string): Promise<DigestPostResult> {
  const channel = process.env.SLACK_DIGEST_CHANNEL;
  if (!channel) return "not configured";
  const text = `*Team digest, week of ${digest.week_of}*\n\n${body}`;
  try {
    const response = await callSlackApi({
      botToken: slackCredentials.botToken,
      operation: digest.slack_ts ? "chat.update" : "chat.postMessage",
      body: digest.slack_ts ? { channel, ts: digest.slack_ts, text } : { channel, text },
    });
    if (!response.ok) return `failed: ${String(response.error)}`;
    if (!digest.slack_ts && typeof response.ts === "string") await setDigestSlackTs(digest.week_of, response.ts);
    return digest.slack_ts ? "updated" : "posted";
  } catch (err) {
    return `failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
