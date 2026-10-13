import type { ApprovalPolicy } from "eve/tools/approval";
import { actorFromAuth, isManager } from "./actor";

// Approval policies run before a tool executes. Denying here means a manager-only
// tool never runs for an IC, whatever the model was talked into. The data layer
// checks the role again inside the tool (defence in depth).

function callerIsManager(ctx: Parameters<ApprovalPolicy>[0]): boolean {
  try {
    return isManager(actorFromAuth(ctx.session.auth.current));
  } catch {
    return false;
  }
}

/** Managers run it straight away; everyone else is refused with a reason the model can relay. */
export const managerOnly: ApprovalPolicy = (ctx) =>
  callerIsManager(ctx)
    ? "not-applicable"
    : { type: "denied", reason: "This information is for managers only. Do not retry; tell the user it is restricted." };

/** Managers must confirm each call in the chat; everyone else is refused. */
export const managerConfirms: ApprovalPolicy = (ctx) =>
  callerIsManager(ctx)
    ? "user-approval"
    : { type: "denied", reason: "Only managers can make this change. Do not retry; tell the user it is restricted." };
