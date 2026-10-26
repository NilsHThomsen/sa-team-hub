import { defineDynamic } from "eve";
import { specialist } from "../../lib/specialists";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      specialist(
        "Deals specialist. Reviews deal coverage and the Top 5 scorecard, and makes deal changes: next steps, presales stage, " +
          "deliverables, SA comments and the main competitor, and for managers creating deals, assigning SAs, sales stage, ACV, close quarter and forecast.",
        ctx,
      ),
  },
});
