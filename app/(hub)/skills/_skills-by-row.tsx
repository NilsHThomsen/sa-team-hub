import type { Person, SkillRow } from "@/agent/lib/data";
import { SKILL_LEVEL_MEANING, SKILL_LEVELS, skillLevelName } from "@/agent/lib/skill-levels";
import { cn } from "@/lib/utils";

/** Level badge colours for the person-per-row layout (?layout=by-person). */
export const LEVEL_STYLE = [
  "bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
  "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  "bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100",
  "bg-sky-300 text-sky-950",
  "bg-sky-600 text-white",
];

type Status = NonNullable<SkillRow["status"]>;
// Legend order: furthest along first.
const STATUSES: readonly Status[] = ["complete", "in_progress", "next_focus", "not_started"];
const STATUS_LABEL: Record<Status, string> = { complete: "Complete", in_progress: "In progress", next_focus: "Next focus", not_started: "Not started" };

/** Product level as four segments, filled up to the level (None = all empty). */
function Segments({ level }: { readonly level: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <span className={cn("h-1.5 w-4 rounded-full", i <= level ? "bg-indigo-600 dark:bg-indigo-400" : "bg-slate-200 dark:bg-slate-700")} key={i} />
      ))}
    </span>
  );
}

function StatusIcon({ status }: { readonly status: Status }) {
  if (status === "complete")
    return (
      <svg aria-label="Complete" className="inline size-4 text-emerald-600" viewBox="0 0 16 16">
        <circle cx="8" cy="8" fill="currentColor" r="8" />
        <path d="M4.5 8.2l2.2 2.2 4.8-4.8" fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      </svg>
    );
  if (status === "in_progress")
    return (
      <svg aria-label="In progress" className="inline size-4 text-amber-500" viewBox="0 0 16 16">
        <circle cx="8" cy="8" fill="none" r="6.5" stroke="currentColor" strokeWidth="2" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
      </svg>
    );
  // Next focus: the same ring as In progress, not yet filled.
  return (
    <svg aria-label={STATUS_LABEL[status]} className={cn("inline size-4", status === "next_focus" ? "text-amber-500" : "text-slate-300 dark:text-slate-600")} viewBox="0 0 16 16">
      <circle cx="8" cy="8" fill="none" r="6.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/**
 * One table with a column per person and a row per skill, in three sections
 * (product skills, certifications, soft skills). Reads down a column for one
 * person's profile, across a row for who knows what.
 */
export function SkillsByRow({ people, skills, viewerId }: { readonly people: readonly Person[]; readonly skills: readonly SkillRow[]; readonly viewerId: string | null }) {
  const names = (category: SkillRow["category"]) => [...new Set(skills.filter((s) => s.category === category).map((s) => s.name))];
  const find = (personId: string, category: string, name: string) => skills.find((s) => s.person_id === personId && s.category === category && s.name === name);
  const mine = (personId: string) => personId === viewerId && "bg-amber-50/70 dark:bg-amber-400/10";
  const sections: { title: string; category: SkillRow["category"] }[] = [
    { title: "Product skills", category: "product" },
    { title: "Hyperscaler Certifications", category: "certification" },
    { title: "Soft skills", category: "enablement" },
  ];
  const namesRow = (
    <tr>
      <th className="sticky left-0 min-w-52 bg-card px-4 py-3 text-left font-medium text-muted-foreground text-xs">Skill</th>
      {people.map((p) => (
        <th className={cn("px-2 py-3 text-center font-medium text-foreground text-xs", mine(p.id))} key={p.id}>
          {p.name}
        </th>
      ))}
    </tr>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
        {SKILL_LEVELS.map((name, i) => (
          <span className="inline-flex items-center gap-1.5" key={name}>
            <Segments level={i} /> {name}
          </span>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {STATUSES.map((s) => (
          <span className="inline-flex items-center gap-1.5" key={s}>
            <StatusIcon status={s} /> {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>{namesRow}</thead>
          {sections.map((section) => (
            <tbody key={section.category}>
              <tr>
                <th className="sticky left-0 border-t bg-card px-4 pt-5 pb-2 text-left">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{section.title}</span>
                </th>
                <td className="border-t" colSpan={people.length} />
              </tr>
              {names(section.category).map((name) => (
                <tr className="group" key={name}>
                  {/* A line above each skill row (border-separate tables draw borders per cell, not per row). */}
                  <td className="sticky left-0 border-t bg-card px-4 py-2 text-foreground group-hover:bg-muted">{name}</td>
                  {people.map((p) => {
                    const skill = find(p.id, section.category, name);
                    const level = skill?.level ?? 0;
                    const status = skill ? (skill.status ?? "not_started") : null;
                    return (
                      <td
                        className={cn("border-t px-2 py-2 text-center group-hover:bg-muted", mine(p.id))}
                        key={p.id}
                        title={
                          section.category === "product"
                            ? `${p.name}: ${skillLevelName(level)}, ${SKILL_LEVEL_MEANING[skillLevelName(level)].toLowerCase()}`
                            : skill && status
                              ? `${p.name}: ${STATUS_LABEL[status]}${skill.completed_on ? `, ${skill.completed_on}` : skill.due_on ? `, due ${skill.due_on}` : ""}`
                              : undefined
                        }
                      >
                        {section.category === "product" ? <Segments level={level} /> : status ? <StatusIcon status={status} /> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
          {/* Names again at the bottom, so you don't scroll back up to see whose column it is. */}
          <tfoot>{namesRow}</tfoot>
        </table>
      </div>
    </div>
  );
}
