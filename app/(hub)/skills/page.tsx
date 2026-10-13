import { listPeople, skillGaps, skillsMatrix } from "@/agent/lib/data";
import { requireActor } from "@/lib/viewer";
import { cn } from "@/lib/utils";
import { PageHeader, Pill, Section, Table, Td } from "../_ui";

const LEVEL_STYLE = ["bg-slate-50 text-slate-400", "bg-slate-100", "bg-sky-100", "bg-sky-300", "bg-sky-600 text-white"];
const LEVEL_LABEL = ["None", "Aware", "Working", "Deep", "Expert"];

export default async function SkillsPage() {
  const { viewer, actor } = await requireActor();
  const [people, skills, gaps] = await Promise.all([listPeople(), skillsMatrix(), skillGaps(actor)]);
  const ics = people.filter((p) => p.role === "ic");

  const productNames = [...new Set(skills.filter((s) => s.category === "product").map((s) => s.name))];
  const enablementNames = [...new Set(skills.filter((s) => s.category === "enablement").map((s) => s.name))];
  const find = (personId: string, category: string, name: string) =>
    skills.find((s) => s.person_id === personId && s.category === category && s.name === name);

  return (
    <>
      <PageHeader
        subtitle="Product depth, certifications and enablement in one place. Team-visible so anyone can find who knows what."
        title="Skills Matrix"
      />

      <Section note={LEVEL_LABEL.map((l, i) => `${i} ${l}`).join(" · ")} title="Product skills">
        <Table head={["Person", ...productNames]}>
          {ics.map((p) => (
            <tr className={cn(p.id === viewer.personId && "bg-amber-50/60")} key={p.id}>
              <Td className="whitespace-nowrap font-medium">{p.name}</Td>
              {productNames.map((name) => {
                const level = find(p.id, "product", name)?.level ?? 0;
                return (
                  <Td key={name}>
                    <span className={cn("inline-block w-8 rounded text-center tabular-nums", LEVEL_STYLE[level])} title={LEVEL_LABEL[level]}>
                      {level}
                    </span>
                  </Td>
                );
              })}
            </tr>
          ))}
        </Table>
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Certifications">
          <Table head={["Person", "Certification", "Status", "Date"]}>
            {skills
              .filter((s) => s.category === "certification")
              .map((s) => (
                <tr key={`${s.person_id}-${s.name}`}>
                  <Td className="whitespace-nowrap">{people.find((p) => p.id === s.person_id)?.name}</Td>
                  <Td>{s.name}</Td>
                  <Td>
                    <Pill value={s.status ?? "not_started"} />
                  </Td>
                  <Td className="whitespace-nowrap text-muted-foreground">{s.completed_on ?? (s.due_on ? `due ${s.due_on}` : "")}</Td>
                </tr>
              ))}
          </Table>
        </Section>

        <Section title="Enablement">
          <Table head={["Person", ...enablementNames.map((n) => n.split(" ")[0])]}>
            {ics.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{p.name}</Td>
                {enablementNames.map((name) => (
                  <Td key={name}>
                    <Pill value={find(p.id, "enablement", name)?.status ?? "not_started"} />
                  </Td>
                ))}
              </tr>
            ))}
          </Table>
        </Section>
      </div>

      <Section note="Compared with next quarter's needs" title="Coverage gaps">
        {gaps.myGaps ? (
          <p className="text-sm">
            Your gaps against next quarter&apos;s needs: {gaps.myGaps.length === 0 ? "none, nice work." : gaps.myGaps.join(", ")}
          </p>
        ) : null}
        <Table head={["Need", "Why", "Have / needed", "Qualified", "Closest"]}>
          {gaps.gaps.map((g) => (
            <tr key={g.name}>
              <Td className="font-medium">{g.name}</Td>
              <Td className="text-muted-foreground">{g.reason}</Td>
              <Td className={cn("whitespace-nowrap tabular-nums", g.short_by > 0 && "font-medium text-red-600")}>
                {g.have} / {g.needed}
              </Td>
              <Td>{g.qualified.join(", ") || (viewer.role === "manager" ? "Nobody yet" : "")}</Td>
              <Td>{g.closest.join(", ")}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
