import { defineDynamic } from "eve";
import { callerIsManager, specialist } from "../../lib/specialists";

// Manager eyes only: for SAs, the app principal and shared Slack channels this
// subagent doesn't exist, so the main agent can't even offer it. Its tools
// check the role again (defence in depth).
export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      callerIsManager(ctx)
        ? specialist(
            "Talent specialist, managers only. The 9-box, retention risk, promotion cases (drafting and deciding), succession, " +
              "the warm bench, and adding or editing team members.",
            ctx,
          )
        : null,
  },
});
