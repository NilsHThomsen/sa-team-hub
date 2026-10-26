import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { listLibrary, listPeople, skillsMatrix } from "@/agent/lib/data";
import { primaryModel } from "@/agent/lib/models";

// Team-wide reads that are the same for every viewer, kept in Vercel's Runtime
// Cache ("use cache: remote": one shared copy across function instances, like the
// digest). Pages use these; agent tools still read Postgres directly. Each has a
// tag so a save can clear it straight away (updateTag only works in Server Actions):
//   people, skills, library: afterAgentTurn in app/(hub)/actions.ts, after each chat turn
//   settings:       savePrimaryModel in app/(hub)/settings/actions.ts
// Changes made elsewhere (Slack, the eve CLI) show when the profile refreshes.

/** The team roster. Changes when a manager adds or edits someone through the agent. */
export async function cachedPeople() {
  "use cache: remote";
  cacheLife("hours");
  cacheTag("people");
  return [...(await listPeople())];
}

/**
 * The Skills Matrix. Everyone sees the same rows; skill updates arrive often, so it
 * refreshes every 5 minutes. Not the "minutes" profile: its 1-minute revalidate
 * looked to stop the Skills page's private cache being reused on navigation.
 */
export async function cachedSkillsMatrix() {
  "use cache: remote";
  cacheLife({ stale: 300, revalidate: 300, expire: 3600 });
  cacheTag("skills");
  return [...(await skillsMatrix())];
}

/** The model a manager picked on Settings. */
export async function cachedPrimaryModel() {
  "use cache: remote";
  cacheLife("hours");
  cacheTag("settings");
  return primaryModel();
}

/**
 * The Library (reference architectures and demo assets). Plain "use cache", not remote:
 * nothing on the Library pages is personal, so the result is baked into the prerendered
 * page, which Vercel keeps in the ISR cache and serves from the CDN. The sign-in check
 * runs in proxy.ts before the cache. A logged reuse clears it straight away (tag
 * "library"); otherwise it refreshes hourly in the background.
 * A build with no database, or one not yet set up for the Library, gets an empty Library.
 */
export async function cachedLibrary() {
  "use cache";
  cacheLife("hours");
  cacheTag("library");
  // Same check as db/setup.ts: a pulled env file can hold a hidden placeholder, not a URL.
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url?.startsWith("postgres")) return { architectures: [], assets: [] };
  try {
    return await listLibrary();
  } catch (err) {
    // A database that db/setup.ts hasn't migrated yet has no Library tables (42P01).
    // On Vercel, setup runs before every build, so this only happens locally.
    if ((err as { code?: string }).code === "42P01") return { architectures: [], assets: [] };
    throw err;
  }
}
