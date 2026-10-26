import { defineDynamic } from "eve";
import { specialist } from "../../lib/specialists";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      specialist(
        "Deals and accounts specialist. Reviews deal coverage, the Top 5 scorecard and customer accounts, and makes deal changes: next steps, presales stage, " +
          "deliverables, SA comments and the main competitor, a customer's power users and champions, and for managers creating deals, assigning SAs, sales stage, ACV, close quarter and forecast.",
        ctx,
      ),
  },
});
