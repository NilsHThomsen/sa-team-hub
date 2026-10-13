import { listAchievements } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";
import { PageHeader, Table, Td } from "../_ui";

export default async function AchievementsPage() {
  const { viewer, actor } = await requireActor();
  const achievements = await listAchievements(actor, { days: 365 });

  return (
    <>
      <PageHeader
        subtitle={
          viewer.role === "manager"
            ? "Everyone's wins over the last 12 months. Used as evidence for promotion cases."
            : "Your wins over the last 12 months. Track them as they happen so review time is easy."
        }
        title="Achievements Doc"
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
