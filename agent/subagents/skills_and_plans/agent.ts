import { defineDynamic } from "eve";
import { specialist } from "../../lib/specialists";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) =>
      specialist(
        "Skills and development specialist. Finds skill gaps and updates the Skills Matrix (product levels, certifications, soft skills), " +
          "development plans and career goals, and for managers next quarter's coverage needs.",
        ctx,
      ),
  },
});
