import { isManager } from "@/agent/lib/actor";
import { listCandidates, listPromotionCases, listRetentionRisks, listSuccession } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";
import { ManagerOnly, PageHeader, Pill, Section, Table, Td } from "../_ui";

export default async function TalentPage() {
  const { actor } = await requireActor();
  // The nav hides this page from ICs, but a typed URL lands here too, so check again.
  // The data functions would also throw AccessDenied: three layers, same rule.
  if (!isManager(actor)) return <ManagerOnly />;

  const [risks, succession, candidates, cases] = await Promise.all([
    listRetentionRisks(actor),
    listSuccession(actor),
    listCandidates(actor),
    listPromotionCases(actor),
  ]);

  return (
    <>
      <PageHeader subtitle="Manager eyes only: retention, promotion cases, succession and the warm bench." title="Talent" />

      <Section note="Changes through the agent require your approval" title="Retention risk">
        <Table head={["Person", "Risk", "Why", "Action plan", "Updated"]}>
          {risks.map((r) => (
            <tr key={r.person_id}>
              <Td className="whitespace-nowrap font-medium">{r.person_name}</Td>
              <Td>
                <Pill value={r.risk} />
              </Td>
              <Td>{r.reason}</Td>
              <Td>{r.action_plan}</Td>
              <Td className="whitespace-nowrap text-muted-foreground">{r.updated_at}</Td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section note="Drafted by the promotion-case workflow" title="Promotion cases">
        {cases.length === 0 ? (
          <p className="text-muted-foreground text-sm">None yet. Ask the agent to draft one, for example for Priya Nair to Principal SA.</p>
        ) : (
          <Table head={["Person", "Target", "Status", "Summary", "Model", "Created"]}>
            {cases.map((c) => (
              <tr key={c.id}>
                <Td className="whitespace-nowrap font-medium">{c.person_name}</Td>
                <Td>{c.target_level}</Td>
                <Td>
                  <Pill value={c.status} />
                </Td>
                <Td>{c.summary}</Td>
                <Td className="whitespace-nowrap text-muted-foreground text-xs">{c.model_used}</Td>
                <Td className="whitespace-nowrap text-muted-foreground">{c.created_at}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Succession">
          <Table head={["Role", "Candidate", "Readiness", "Pros", "Cons"]}>
            {succession.map((s) => (
              <tr key={s.id}>
                <Td className="whitespace-nowrap">{s.role_name}</Td>
                <Td className="whitespace-nowrap font-medium">
                  {s.candidate}
                  <div className="text-muted-foreground text-xs">{s.kind}</div>
                </Td>
                <Td>
                  <Pill value={s.readiness} />
                </Td>
                <Td>{s.pros}</Td>
                <Td>{s.cons}</Td>
              </tr>
            ))}
          </Table>
        </Section>

        <Section title="Warm bench">
          <Table head={["Candidate", "Focus", "Stage", "Last contact", "Notes"]}>
            {candidates.map((c) => (
              <tr key={c.id}>
                <Td className="whitespace-nowrap font-medium">
                  {c.name}
                  <div className="text-muted-foreground text-xs">{c.current_job}</div>
                </Td>
                <Td>{c.focus}</Td>
                <Td>{c.stage}</Td>
                <Td className={c.days_since_contact > 30 ? "whitespace-nowrap text-amber-700" : "whitespace-nowrap text-muted-foreground"}>
                  {c.days_since_contact} days ago
                </Td>
                <Td>{c.notes}</Td>
              </tr>
            ))}
          </Table>
        </Section>
      </div>
    </>
  );
}
