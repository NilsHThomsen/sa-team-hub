import { defineSchedule } from "eve/schedules";
import { latestDigest } from "../lib/data";
import slack from "../channels/slack";

// Posts the digest that friday-digest saved to a team Slack channel, 30 minutes
// later. Set SLACK_DIGEST_CHANNEL (a channel id like C0123ABCD) to turn it on.
export default defineSchedule({
  cron: "30 6 * * 5",
  async run({ to, waitUntil, appAuth }) {
    const channelId = process.env.SLACK_DIGEST_CHANNEL;
    if (!channelId) return;
    const digest = await latestDigest();
    // Only this week's digest; never re-post an old one if the Friday run failed.
    if (!digest || Date.now() - Date.parse(digest.week_of) > 7 * 24 * 60 * 60 * 1000) return;
    waitUntil(
      to(slack, { channelId }).send(
        `Post this week's team digest to the channel exactly as written below, with a one-line heading "Team digest, week of ${digest.week_of}". Do not call any tools.\n\n${digest.body}`,
        { auth: appAuth },
      ),
    );
  },
});
