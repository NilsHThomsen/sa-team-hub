import type { Person, SkillRow } from "@/agent/lib/data";
import { SKILL_LEVEL_MEANING, SKILL_LEVELS, skillLevelName } from "@/agent/lib/skill-levels";
import { cn } from "@/lib/utils";
import { Pill } from "../_ui";

export const LEVEL_STYLE = ["bg-slate-50 text-slate-400", "bg-slate-100", "bg-sky-100", "bg-sky-300", "bg-sky-600 text-white"];

/**
 * One table with a column per person and a row per skill, in three sections
 * (product skills, certifications, soft skills) split by heading rows. Reads
 * down a column for one person's profile, across a row for who knows what.
 */
export function SkillsByRow({ people, skills, viewerId }: { readonly people: readonly Person[]; readonly skills: readonly SkillRow[]; readonly viewerId: string | null }) {
  const names = (category: SkillRow["category"]) => [...new Set(skills.filter((s) => s.category === category).map((s) => s.name))];
  const find = (personId: string, category: string, name: string) => skills.find((s) => s.person_id === personId && s.category === category && s.name === name);
  const mine = (personId: string) => personId === viewerId && "bg-amber-50/60";

  const sections: { title: string; note?: string; category: SkillRow["category"] }[] = [
    { title: "Product skills", note: SKILL_LEVELS.join(" → "), category: "product" },
    { title: "Certifications", category: "certification" },
    { title: "Soft skills", category: "enablement" },
  ];

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-muted-foreground text-xs">
          <tr>
            <th className="sticky left-0 min-w-48 bg-muted px-3 py-2 font-medium">Skill</th>
            {people.map((p) => (
              <th className={cn("px-2 py-2 text-center font-medium", mine(p.id))} key={p.id}>
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        {sections.map((section) => (
          <tbody className="border-t-4 border-muted" key={section.category}>
            <tr className="bg-muted/40">
              <th className="sticky left-0 bg-muted px-3 py-2 text-left font-semibold" colSpan={1}>
                {section.title}
              </th>
              <td className="px-2 py-2 text-muted-foreground text-xs" colSpan={people.length}>
                {section.note}
              </td>
            </tr>
            {names(section.category).map((name) => (
              <tr className="border-t" key={name}>
                <td className="sticky left-0 bg-card px-3 py-2">{name}</td>
                {people.map((p) => {
                  const skill = find(p.id, section.category, name);
                  return (
                    <td className={cn("px-2 py-2 text-center", mine(p.id))} key={p.id}>
                      {section.category === "product" ? (
                        <span
                          className={cn("inline-block min-w-[4.5rem] rounded px-1.5 py-0.5 text-center text-xs", LEVEL_STYLE[skill?.level ?? 0])}
                          title={SKILL_LEVEL_MEANING[skillLevelName(skill?.level ?? 0)]}
                        >
                          {skillLevelName(skill?.level ?? 0)}
                        </span>
                      ) : skill ? (
                        <span title={skill.completed_on ? `Completed ${skill.completed_on}` : skill.due_on ? `Due ${skill.due_on}` : undefined}>
                          <Pill value={skill.status ?? "not_started"} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">–</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
