import { defineTool } from "eve/tools";
import { z } from "zod";
import { actorFromAuth } from "../../../lib/actor";
import { CHAMPION_LABEL, CHAMPION_STATUSES, updatePowerUser } from "../../../lib/data";
import { signedInConfirms } from "../../../lib/policies";

export default defineTool({
  description:
    "Update a power user at a customer: their champion status (user, potential, champion) and the suggested next move to win them over. " +
    "SAs update people at accounts they cover; managers at any account. The user confirms the change in the chat before it is saved.",
  inputSchema: z.object({
    name: z.string().min(1).describe("The person's name, e.g. 'Sam Wright'"),
    account: z.string().optional().describe("Their company, if the name is ambiguous"),
    champion: z.enum(CHAMPION_STATUSES).optional(),
    nextMove: z.string().max(300).optional().describe("A concrete next step, e.g. 'Exec readout with their CTO before the renewal'"),
  }),
  // A write to a shared record: whoever asks confirms it first.
  approval: signedInConfirms,
  async execute(input, ctx) {
    const actor = actorFromAuth(ctx.session.auth.current);
    // Writing the same values again changes nothing, so a replayed step is harmless.
    return updatePowerUser(actor, input);
  },
  label: {
    start: ({ name }) => `Update ${name}`,
    complete: (_input, output) => `${output.name} (${output.account}): ${CHAMPION_LABEL[output.champion]}`,
  },
});
