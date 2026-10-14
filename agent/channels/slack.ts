import { type SlackInboundMessageContext, type SlackMessage, slackChannel } from "eve/channels/slack";
import { slackCredentials } from "../lib/slack";
import { slackAuthFor } from "../lib/slack-auth";

const NOT_LINKED =
  "I don't know who you are yet, so I can't help here. Ask your manager to link your Slack account on the SA Team Hub Settings page.";

// A valid Slack signature only proves Slack sent the event, so every entry point
// maps the Slack member to a team member first and fails closed.
async function admit(ctx: SlackInboundMessageContext, message: SlackMessage) {
  if (!message.author || message.author.isBot) return null;
  const auth = await slackAuthFor(message.author.userId, message.channelId);
  if (!auth) {
    await ctx.thread.post(NOT_LINKED);
    return null;
  }
  return { auth };
}

export default slackChannel({
  // Vercel Connect holds the bot token and verifies requests (see lib/slack.ts).
  credentials: slackCredentials,
  onAppMention: admit,
  onDirectMessage: admit,
  // Follow-ups in a thread the agent is already in, without another @mention.
  async onMessage(ctx, message) {
    return (await ctx.isSubscribed()) ? admit(ctx, message) : null;
  },
  // Approval buttons: the person clicking must be linked too, and the change then
  // runs with their own rights (an SA approving cannot change a colleague's deal).
  async onInputResponse(ctx, submission) {
    const auth = await slackAuthFor(submission.user.id, ctx.slack.channelId);
    return auth ? { auth } : null;
  },
});
