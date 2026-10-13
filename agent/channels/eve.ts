import { eveChannel } from "eve/channels/eve";
import { type AuthFn, localDev, vercelOidc } from "eve/channels/auth";
import { readCookie, SESSION_COOKIE, verifySession } from "../lib/session";

/**
 * Accepts the dashboard's signed session cookie. The browser sends it to
 * /eve/v1/* automatically because withEve() mounts the agent on the same
 * origin as the Next.js app. The verified role travels with the session as
 * ctx.session.auth.current, which every tool checks (see lib/actor.ts).
 */
function teamHubSession(): AuthFn<Request> {
  return async (request) => {
    const viewer = await verifySession(readCookie(request.headers.get("cookie"), SESSION_COOKIE));
    if (!viewer) return null; // not ours: fall through to the next entry
    return {
      authenticator: "sa-team-hub",
      principalId: viewer.personId,
      principalType: "user",
      attributes: { role: viewer.role, name: viewer.name },
    };
  };
}

export default eveChannel({
  // No anonymous access and no placeholder: a request without a valid session
  // cookie gets a 401. vercelOidc() lets the eve CLI reach a deployment for
  // debugging; tools still refuse that caller because it has no team role.
  auth: [teamHubSession(), vercelOidc(), localDev()],
});
