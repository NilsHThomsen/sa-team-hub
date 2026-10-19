import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { listPeople, skillsMatrix } from "@/agent/lib/data";
import { primaryModel } from "@/agent/lib/models";

// Team-wide reads that are the same for every viewer, kept in Vercel's Runtime
// Cache ("use cache: remote": one shared copy across function instances, like the
// digest). Pages use these; agent tools still read Postgres directly. Each has a
// tag so a save can clear it straight away (updateTag only works in Server Actions):
//   people, skills: afterAgentTurn in app/(hub)/actions.ts, after each chat turn
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
