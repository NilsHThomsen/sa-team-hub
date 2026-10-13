import { listAchievements, listPeople } from "@/agent/lib/data";
import { byPeople, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "../_person-filter";
import { PageHeader, Table, Td } from "../_ui";

export default async function AchievementsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { viewer, actor } = await requireActor();
  const [all, people, selected] = await Promise.all([listAchievements(actor, { days: 365 }), listPeople(), selectedPeople(searchParams)]);
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
        actions={viewer.role === "manager" ? <PersonFilter people={people.filter((p) => p.role === "ic")} /> : null}
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
    </>
  );
}
