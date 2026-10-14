import { listPeople, skillGaps, skillsMatrix } from "@/agent/lib/data";
import { byPeople, type SearchParams, selectedPeople } from "@/lib/people-filter";
import { requireActor } from "@/lib/viewer";
import { PersonFilter } from "../_person-filter";
import { SKILL_LEVEL_MEANING, SKILL_LEVELS, skillLevelName } from "@/agent/lib/skill-levels";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { PageHeader, Pill, Section, Table, Td } from "../_ui";
import { LEVEL_STYLE, SkillsByRow } from "./_skills-by-row";

// Two layouts while we try the flipped one: people as columns (default) or the
// original person-per-row tables (?layout=by-person).
const LAYOUT_PARAM = "layout";

export default async function SkillsPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const { viewer, actor } = await requireActor();
  const [people, allSkills, gaps, selected, params] = await Promise.all([listPeople(), skillsMatrix(), skillGaps(actor), selectedPeople(searchParams), searchParams]);
  const byPerson = params[LAYOUT_PARAM] === "by-person";
  const toggle = new URLSearchParams(Object.entries(params).flatMap(([k, v]) => (k === LAYOUT_PARAM || v === undefined ? [] : [[k, String(v)]])));
  if (!byPerson) toggle.set(LAYOUT_PARAM, "by-person");
  const team = people.filter((p) => p.role === "ic");
  const ics = byPeople(team, selected, (p) => p.id);
  const skills = byPeople(allSkills, selected, (s) => s.person_id);

  const productNames = [...new Set(skills.filter((s) => s.category === "product").map((s) => s.name))];
  const enablementNames = [...new Set(skills.filter((s) => s.category === "enablement").map((s) => s.name))];
  const find = (personId: string, category: string, name: string) => skills.find((s) => s.person_id === personId && s.category === category && s.name === name);

  return (
    <>
      <PageHeader
        subtitle="Product depth, certifications and soft skills in one place. Team-visible so anyone can find who knows what."
        title="Skills Matrix"
        actions={
          <div className="flex items-center gap-3">
            <PersonFilter people={team} />
            <Link className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" href={`/skills${toggle.size ? `?${toggle}` : ""}`}>
              {byPerson ? "People as columns" : "People as rows"}
            </Link>
          </div>
        }
      />

      {byPerson ? null : (
        <div className="mb-8">
          <SkillsByRow people={ics} skills={skills} viewerId={viewer.personId} />
        </div>
      )}
      {byPerson ? (
        <>
          <Section note={SKILL_LEVELS.join(" → ")} title="Product skills">
            <Table head={["Person", ...productNames]}>
              {ics.map((p) => (
                <tr className={cn(p.id === viewer.personId && "bg-amber-50/60")} key={p.id}>
                  <Td className="whitespace-nowrap font-medium">{p.name}</Td>
                  {productNames.map((name) => {
                    const level = find(p.id, "product", name)?.level ?? 0;
                    return (
                      <Td key={name}>
                        <span
                          className={cn("inline-block min-w-[4.5rem] rounded px-1.5 py-0.5 text-center text-xs", LEVEL_STYLE[level])}
                          title={SKILL_LEVEL_MEANING[skillLevelName(level)]}
                        >
                          {skillLevelName(level)}
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

            <Section title="Soft skills">
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
        </>
      ) : null}

      <Section note="Whole team, compared with next quarter's needs" title="Coverage gaps">
        {gaps.myGaps ? <p className="text-sm">Your gaps against next quarter&apos;s needs: {gaps.myGaps.length === 0 ? "none, nice work." : gaps.myGaps.join(", ")}</p> : null}
        <Table head={["Need", "Why", "Have / needed", "Qualified", "Closest"]}>
          {gaps.gaps.map((g) => (
            <tr key={g.name}>
              <Td className="font-medium">
                {g.name}
                {g.min_level ? <div className="font-normal text-muted-foreground text-xs">{g.min_level} or above</div> : null}
              </Td>
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
