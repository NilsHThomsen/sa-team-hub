import { jwtVerify, SignJWT } from "jose";

// Demo authentication shared by the Next.js dashboard and the eve agent.
//
// The dashboard signs a short-lived HS256 JWT into an httpOnly cookie. Because
// the eve routes are mounted on the same origin (/eve/v1/*), the browser sends
// that cookie to the agent too, and agent/channels/eve.ts verifies it with the
// same secret. One identity, checked at both doors. In production this cookie
// would come from the company IdP (or Vercel Passport) instead of a demo login.

export const SESSION_COOKIE = "teamhub_session";
const ISSUER = "sa-team-hub";
const AUDIENCE = "sa-team-hub";

export type Role = "ic" | "manager";
export interface Viewer {
  readonly personId: string;
  readonly name: string;
  readonly role: Role;
}

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function signSession(viewer: Viewer): Promise<string> {
  return new SignJWT({ name: viewer.name, role: viewer.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(viewer.personId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

export async function verifySession(token: string | null | undefined): Promise<Viewer | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || typeof payload.name !== "string" || (role !== "ic" && role !== "manager")) {
      return null;
    }
    return { personId: payload.sub, name: payload.name, role };
  } catch {
    return null; // expired, tampered or signed with another secret
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
