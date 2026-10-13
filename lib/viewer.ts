import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Actor, actorFromViewer } from "@/agent/lib/actor";
import { SESSION_COOKIE, type Viewer, verifySession } from "@/agent/lib/session";

export async function getViewer(): Promise<Viewer | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/** For server components and actions: the signed-in viewer as a data-layer Actor. */
export async function requireActor(): Promise<{ viewer: Viewer; actor: Actor }> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return { viewer, actor: actorFromViewer(viewer) };
}
