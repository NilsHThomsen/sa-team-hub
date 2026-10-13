import { listDevPlans } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";
import { PageHeader, Pill, Table, Td } from "../_ui";

export default async function DevPlansPage() {
  const { viewer, actor } = await requireActor();
  const plans = await listDevPlans(actor);

  return (
    <>
      <PageHeader
        subtitle={viewer.role === "manager" ? "Career development plans for the team, overdue first." : "Your career development plan."}
        title="Development Plans"
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
