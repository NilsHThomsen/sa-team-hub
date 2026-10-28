import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { removeTeamActivity } from "../../../lib/data";
import { managerConfirms } from "../../../lib/policies";

export default defineTool({
  description: "Remove a planned activity from the Team utilisation plan by its id (from get_team_utilisation). Managers only; the manager confirms first.",
  inputSchema: z.object({ id: z.number().int().positive() }),
  approval: managerConfirms,
  async execute({ id }, ctx) {
    return removeTeamActivity(actorFromAuth(ctx.session.auth.current), id);
  },
  label: { start: ({ id }) => `Remove planned activity ${id}` },
});
