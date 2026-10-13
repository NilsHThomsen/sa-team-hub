import type { Role, Viewer } from "./session";

// Who is asking. Every data function in data.ts takes an Actor and enforces
// access itself, so the dashboard and the agent share one set of rules.
//   user: a signed-in person (IC or manager)
//   app:  eve's own principal, used by the Friday digest schedule. It can read
//         team-level data and write digests, but never manager-only tables.
export type Actor =
  | { readonly kind: "user"; readonly personId: string; readonly name: string; readonly role: Role }
  | { readonly kind: "app" };

export class AccessDenied extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDenied";
  }
}

export function actorFromViewer(viewer: Viewer): Actor {
  return { kind: "user", ...viewer };
}

// Minimal shape of eve's SessionAuthContext that we rely on.
interface AuthLike {
  readonly authenticator: string;
  readonly principalId: string;
  readonly principalType: string;
  readonly attributes: Readonly<Record<string, string | readonly string[]>>;
}

/**
 * Maps the eve caller (ctx.session.auth.current) to an Actor.
 * Unknown callers get nothing: this fails closed, so a request that was let in by
 * some other authenticator still cannot read team data.
 */
export function actorFromAuth(auth: AuthLike | null | undefined): Actor {
  if (!auth) throw new AccessDenied("No signed-in user on this session.");

  if (auth.authenticator === "sa-team-hub" && auth.principalType === "user") {
    const role = auth.attributes.role;
    const name = auth.attributes.name;
    if ((role === "ic" || role === "manager") && typeof name === "string") {
      return { kind: "user", personId: auth.principalId, name, role };
    }
  }

  if (auth.authenticator === "app" && auth.principalId === "eve:app" && auth.principalType === "runtime") {
    return { kind: "app" };
  }

  // `eve dev` on a laptop: act as the demo manager so the terminal UI is usable.
  // localDev() only ever authenticates on a local dev server, never in production.
  if ((auth.principalType === "local-dev" || auth.authenticator === "local-dev") && process.env.EVE_DEV === "1") {
    return { kind: "user", personId: "jordan-hayes", name: "Jordan Hayes (local dev)", role: "manager" };
  }

  throw new AccessDenied("This caller is not a recognised SA Team Hub user.");
}

export function isManager(actor: Actor): boolean {
  return actor.kind === "user" && actor.role === "manager";
}

export function requireManager(actor: Actor, what: string): void {
  if (!isManager(actor)) throw new AccessDenied(`${what} is visible to managers only.`);
}
