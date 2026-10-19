import { cachedPeople } from "@/lib/cached";
import type { Viewer } from "@/agent/lib/session";
import type { Actor } from "@/agent/lib/actor";
import { cacheLife } from "next/cache";
import { CAREER_GOALS } from "@/agent/lib/career-goals";
import { type CareerGoalRow, type DevPlan, listCareerGoals, listDevPlans } from "@/agent/lib/data";
import { byPeople, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { cn } from "@/lib/utils";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "../_person-filter";
import { PageHeader, Pill, Section, Table, Td } from "../_ui";

const NOT_SET = "Not set";

export default async function DevPlansPage({ searchParams }: { readonly searchParams: SearchParams }) {
  // Sign-in check (and its redirect) stays outside the cache.
  const [{ viewer, actor }, params] = await Promise.all([requireActor(), searchParams]);
  return <DevPlansBody actor={actor} params={params} viewer={viewer} />;
}

// "use cache: private": the result is kept only in this person's browser, never in a
// server cache, so personal data isn't shared. Back/forward and repeat visits within a
// minute reuse it without a server round trip. Server Actions (revalidatePath, and
// updateTag after each chat turn) clear it; a reload always fetches fresh data.
async function DevPlansBody({ viewer, actor, params }: { readonly viewer: Viewer; readonly actor: Actor; readonly params: Awaited<SearchParams> }) {
  "use cache: private";
  cacheLife({ stale: 60 });
  const manager = viewer.role === "manager";
  const [allPlans, allGoals, people, selected] = await Promise.all([listDevPlans(actor), listCareerGoals(actor), cachedPeople(), selectedPeople(Promise.resolve(params))]);
  const plans = byPeople(allPlans, selected, (p) => p.person_id);
  const goals = byPeople(allGoals, selected, (g) => g.person_id);

  // One heading per career goal, in the order of CAREER_GOALS, with "Not set" last.
  const groups = [...CAREER_GOALS, NOT_SET]
    .map((heading) => ({ heading, people: goals.filter((g) => (g.goal ?? NOT_SET) === heading) }))
    .filter((group) => group.people.length > 0);

  return (
    <>
      <PageHeader
        subtitle={manager ? "Career goals and development plans for the team. Ask the agent to change a goal or plan." : "Your career goal and development plan. Ask the agent to change your goal or plan."}
        title="Development Plans"
        actions={manager ? <PersonFilter people={people.filter((p) => p.role === "ic")} /> : null}
      />
      {groups.map(({ heading, people: members }) => (
        <Section key={heading} note={`${members.length} ${members.length === 1 ? "person" : "people"}`} title={heading}>
          <Table head={["Person", "Career goal", "Plan", "Next step", "Due", "Status"]}>
            {members.map((g) => (
              <PlanRows goal={g} key={g.person_id} plans={plans.filter((p) => p.person_id === g.person_id)} />
            ))}
          </Table>
        </Section>
      ))}
      {groups.length === 0 ? <p className="text-muted-foreground text-sm">No one matches the filter.</p> : null}
    </>
  );
}

function PlanRows({ goal, plans }: { readonly goal: CareerGoalRow; readonly plans: readonly DevPlan[] }) {
  // Someone with several plans gets one Person and Career goal cell spanning all their rows.
  const span = Math.max(plans.length, 1);
  const align = span > 1 ? "align-middle" : undefined;
  const who = (
    <>
      <Td className={cn("whitespace-nowrap", align)} rowSpan={span}>{goal.person_name}</Td>
      <Td className={align} rowSpan={span}>
        <div className="whitespace-nowrap">{goal.goal ?? <span className="text-muted-foreground">Not set</span>}</div>
        {goal.note ? <div className="mt-1 max-w-56 text-muted-foreground text-xs">{goal.note}</div> : null}
        {goal.updated_by_name ? (
          <div className="mt-1 text-muted-foreground text-xs">
            Set by {goal.updated_by_name}, <span className="whitespace-nowrap">{goal.updated_at}</span>
          </div>
        ) : null}
      </Td>
    </>
  );
  if (plans.length === 0) {
    return (
      <tr>
        {who}
        <Td className="text-muted-foreground" colSpan={4}>
          No development plan yet.
        </Td>
      </tr>
    );
  }
  return plans.map((p, i) => (
    <tr key={p.id}>
      {i === 0 ? who : null}
      <Td>{p.goal}</Td>
      <Td>{p.next_step}</Td>
      <Td className="whitespace-nowrap text-muted-foreground">{p.due_on}</Td>
      <Td>
        <Pill value={p.overdue ? "overdue" : p.status} />
      </Td>
    </tr>
  ));
}
