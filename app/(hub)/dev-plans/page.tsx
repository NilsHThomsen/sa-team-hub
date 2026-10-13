import { listDevPlans, listPeople } from "@/agent/lib/data";
import { byPeople, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "../_person-filter";
import { PageHeader, Pill, Table, Td } from "../_ui";

export default async function DevPlansPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { viewer, actor } = await requireActor();
  const [all, people, selected] = await Promise.all([listDevPlans(actor), listPeople(), selectedPeople(searchParams)]);
  const plans = byPeople(all, selected, (p) => p.person_id);

  return (
    <>
      <PageHeader
        subtitle={viewer.role === "manager" ? "Career development plans for the team, overdue first." : "Your career development plan."}
        title="Development Plans"
        actions={viewer.role === "manager" ? <PersonFilter people={people.filter((p) => p.role === "ic")} /> : null}
      />
      <Table head={["Person", "Goal", "Target", "Next step", "Due", "Status"]}>
        {plans.map((p) => (
          <tr key={p.id}>
            <Td className="whitespace-nowrap">{p.person_name}</Td>
            <Td>{p.goal}</Td>
            <Td>{p.target_level}</Td>
            <Td>{p.next_step}</Td>
            <Td className="whitespace-nowrap text-muted-foreground">{p.due_on}</Td>
            <Td>
              <Pill value={p.overdue ? "overdue" : p.status} />
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
