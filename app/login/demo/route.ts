import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { findPerson } from "@/agent/lib/data";
import { SESSION_COOKIE, signSession } from "@/agent/lib/session";

// One-click demo sign-in for the panel deck: /login/demo?key=...&as=<personId>.
// Off unless DEMO_LINK_KEY is set, so removing that variable (and redeploying)
// kills every shared link. DEMO_LINK_UNTIL (YYYY-MM-DD) makes the link expire.
// Signs in as the manager unless `as` names someone else.
const DEFAULT_PERSON = "jordan-hayes";

export async function GET(request: NextRequest) {
  // TEMP diagnostics: the reason shows as /login?demo=<reason>. Remove after testing.
  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?demo=${reason}`, request.url));
  const expected = process.env.DEMO_LINK_KEY?.trim();
  const key = request.nextUrl.searchParams.get("key")?.trim();
  if (!expected) return fail("no-env-key");
  if (expected.length < 16) return fail("env-key-too-short");
  if (key !== expected) return fail(`key-mismatch-${key?.length ?? 0}-vs-${expected.length}`);

  const until = process.env.DEMO_LINK_UNTIL;
  if (until && new Date() > new Date(`${until}T23:59:59Z`)) return fail("expired");

  const personId = request.nextUrl.searchParams.get("as") ?? DEFAULT_PERSON;
  const person = await findPerson(personId).catch(() => null);
  if (!person || person.id !== personId) return fail("no-person");

  const token = await signSession({ personId: person.id, name: person.name, role: person.role });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return NextResponse.redirect(new URL("/", request.url));
}
