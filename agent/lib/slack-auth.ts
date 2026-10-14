import { findPersonBySlackId } from "./data";

// Turns a Slack member into the same principal the web app uses, so every tool,
// approval policy and data-layer rule applies unchanged. Only people a manager
// has linked on the Settings page get in; everyone else is refused.
//
// `channel` records whether the conversation is a 1:1 DM. In any other
// conversation actorFromAuth limits everyone to IC-level access, because other
// people can read the replies.
export async function slackAuthFor(slackUserId: string | undefined, channelId: string) {
  if (!slackUserId) return null;
  const person = await findPersonBySlackId(slackUserId);
  if (!person) return null;
  const isDirectMessage = channelId.startsWith("D");
  return {
    authenticator: "sa-team-hub",
    principalId: person.id,
    principalType: "user",
    attributes: { role: person.role, name: person.name, channel: isDirectMessage ? "slack-dm" : "slack-shared" },
  };
}
