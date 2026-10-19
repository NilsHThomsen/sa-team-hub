import type { Viewer } from "@/agent/lib/session";
import type { Actor } from "@/agent/lib/actor";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { listAchievements, listPeople, listSentShoutouts } from "@/agent/lib/data";
import { byPeople, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "../_person-filter";
import { PageHeader, Pill, Section, Table, Td } from "../_ui";

export default async function AchievementsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  // Sign-in check (and its redirect) stays outside the cache.
  const [{ viewer, actor }, params] = await Promise.all([requireActor(), searchParams]);
  return <AchievementsBody actor={actor} params={params} viewer={viewer} />;
}

// "use cache: private": the result is kept only in this person's browser, never in a
// server cache, so personal data isn't shared. Back/forward and repeat visits within a
// minute reuse it without a server round trip. Server Actions (revalidatePath, and
// updateTag after each chat turn) clear it; a reload always fetches fresh data.
async function AchievementsBody({ viewer, actor, params }: { readonly viewer: Viewer; readonly actor: Actor; readonly params: Awaited<SearchParams> }) {
  "use cache: private";
  cacheLife({ stale: 60 });
  const [all, people, selected, sent] = await Promise.all([listAchievements(actor, { days: 365 }), listPeople(), selectedPeople(Promise.resolve(params)), listSentShoutouts(actor)]);
  const achievements = byPeople(all, selected, (a) => a.person_id);

  return (
    <>
      <PageHeader
        subtitle={
          viewer.role === "manager"
            ? "Everyone's wins over the last 12 months. Used as evidence for promotion cases."
            : "Your wins over the last 12 months. Track them as they happen so review time is easy."
        }
        title="Achievements Doc"
        // ICs only ever see their own rows, so the filter is for managers.
        actions={
          <div className="flex items-center gap-3">
            {viewer.role === "manager" ? <PersonFilter people={people.filter((p) => p.role === "ic")} /> : null}
            <Link className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" href="/s" title="Ask the agent, e.g. 'Send Hannah a shout-out for the Kestrel workshop'">
              Send a shout-out
            </Link>
          </div>
        }
      />
      <Table head={["Date", "Person", "Category", "Achievement", "Impact"]}>
        {achievements.map((a) => (
          <tr key={a.id}>
            <Td className="whitespace-nowrap text-muted-foreground">{a.occurred_on}</Td>
            <Td className="whitespace-nowrap">{a.person_name}</Td>
            <Td>{a.category}</Td>
            <Td className="font-medium">{a.title}</Td>
            <Td className="text-muted-foreground">{a.impact}</Td>
          </tr>
        ))}
      </Table>
      {sent.length > 0 ? (
        <div className="mt-8">
          <Section note="They go into the recipient's doc once they accept" title="Shout-outs you sent">
            <Table head={["Sent", "To", "Shout-out", "Status"]}>
              {sent.map((s) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap text-muted-foreground">{s.created_at}</Td>
                  <Td className="whitespace-nowrap">{s.to_name}</Td>
                  <Td className="font-medium">{s.title}</Td>
                  <Td>
                    <Pill label={s.status === "pending" ? "waiting" : undefined} value={s.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          </Section>
        </div>
      ) : null}
    </>
  );
}
