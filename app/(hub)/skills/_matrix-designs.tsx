import type { ReactNode } from "react";
import type { Person, SkillRow } from "@/agent/lib/data";
import { SKILL_LEVEL_MEANING, SKILL_LEVELS, skillLevelName } from "@/agent/lib/skill-levels";
import { cn } from "@/lib/utils";

// Three candidate looks for the people-as-columns matrix (?design=signal|heatmap|bars),
// so the team can pick one on the preview deployment. Same data and layout; only
// how a level or a status is drawn changes. The chosen one replaces the others.

export const DESIGNS = ["signal", "heatmap", "bars"] as const;
export type Design = (typeof DESIGNS)[number];
export const isDesign = (v: unknown): v is Design => typeof v === "string" && (DESIGNS as readonly string[]).includes(v);

type Status = "complete" | "in_progress" | "not_started";
const STATUS_LABEL: Record<Status, string> = { complete: "Complete", in_progress: "In progress", not_started: "Not started" };

interface Look {
  level: (level: number) => ReactNode;
  status: (status: Status | null) => ReactNode;
  legend: ReactNode;
  section: (title: string, index: number) => string;
  accent?: (index: number) => ReactNode;
  header: (p: Person) => ReactNode;
}

// ---------- A. Signal: dot meters and status icons, nearly monochrome ----------

function Dots({ level }: { readonly level: number }) {
  return (
    <span className="inline-flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <span className={cn("size-2 rounded-full", i <= level ? "bg-indigo-600" : "bg-slate-200")} key={i} />
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
  return (
    <svg aria-label="Not started" className="inline size-4 text-slate-300" viewBox="0 0 16 16">
      <circle cx="8" cy="8" fill="none" r="6.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

const signal: Look = {
  level: (level) => <Dots level={level} />,
  status: (status) => (status ? <StatusIcon status={status} /> : null),
  legend: (
    <>
      {SKILL_LEVELS.map((name, i) => (
        <span className="inline-flex items-center gap-1.5" key={name}>
          <Dots level={i} /> {name}
        </span>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      {(["complete", "in_progress", "not_started"] as const).map((s) => (
        <span className="inline-flex items-center gap-1.5" key={s}>
          <StatusIcon status={s} /> {STATUS_LABEL[s]}
        </span>
      ))}
    </>
  ),
  section: () => "text-[11px] uppercase tracking-wider text-muted-foreground",
  header: (p) => p.name,
};

// ---------- B. Heatmap: full colour tiles, one hue for depth ----------

const HEAT = ["bg-slate-50 text-slate-400", "bg-violet-100 text-violet-900", "bg-violet-300 text-violet-950", "bg-violet-500 text-white", "bg-violet-700 text-white"];
const HEAT_STATUS: Record<Status, string> = {
  complete: "bg-emerald-500 text-white",
  in_progress: "bg-amber-200 text-amber-900",
  not_started: "bg-slate-100 text-slate-400",
};

function Tile({ className, children, title }: { readonly className: string; readonly children?: ReactNode; readonly title?: string }) {
  return (
    <span className={cn("flex h-8 w-full min-w-[4.25rem] items-center justify-center rounded-md font-medium text-[11px]", className)} title={title}>
      {children}
    </span>
  );
}

const heatmap: Look = {
  level: (level) => <Tile className={HEAT[level]}>{skillLevelName(level)}</Tile>,
  status: (status) =>
    status ? (
      <Tile className={HEAT_STATUS[status]}>{status === "complete" ? "✓" : status === "in_progress" ? "In progress" : ""}</Tile>
    ) : (
      <Tile className="border border-dashed border-slate-200" />
    ),
  legend: (
    <>
      <span className="inline-flex overflow-hidden rounded-md">
        {SKILL_LEVELS.map((name, i) => (
          <span className={cn("px-2 py-1 text-xs", HEAT[i])} key={name}>
            {name}
          </span>
        ))}
      </span>
      <span className="mx-1 h-4 w-px bg-border" />
      {(["complete", "in_progress", "not_started"] as const).map((s) => (
        <span className="inline-flex items-center gap-1.5" key={s}>
          <span className={cn("size-3 rounded", HEAT_STATUS[s])} /> {STATUS_LABEL[s]}
        </span>
      ))}
    </>
  ),
  section: () => "text-sm font-semibold",
  header: (p) => p.name,
};

// ---------- C. Bars: segmented bars, dot-and-text status, avatar headers ----------

const SECTION_ACCENT = ["bg-sky-500", "bg-violet-500", "bg-emerald-500"];

function Bar({ level }: { readonly level: number }) {
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <span className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <span className={cn("h-1.5 w-4 rounded-full", i <= level ? "bg-sky-600" : "bg-slate-200")} key={i} />
        ))}
      </span>
      <span className={cn("text-[11px]", level === 0 ? "text-slate-400" : "text-slate-600")}>{skillLevelName(level)}</span>
    </span>
  );
}

const STATUS_DOT: Record<Status, string> = { complete: "bg-emerald-500", in_progress: "bg-amber-400", not_started: "border border-slate-300" };

function StatusText({ status }: { readonly status: Status }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs", status === "not_started" ? "text-slate-400" : "text-slate-700")}>
      <span className={cn("size-2 rounded-full", STATUS_DOT[status])} />
      {status === "complete" ? "Done" : STATUS_LABEL[status]}
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const bars: Look = {
  level: (level) => <Bar level={level} />,
  status: (status) => (status ? <StatusText status={status} /> : null),
  legend: (
    <>
      {SKILL_LEVELS.slice(1).map((name, i) => (
        <span className="inline-flex items-center gap-1.5" key={name}>
          <Bar level={i + 1} />
        </span>
      ))}
      <span className="mx-1 h-4 w-px bg-border" />
      {(["complete", "in_progress", "not_started"] as const).map((s) => (
        <StatusText key={s} status={s} />
      ))}
    </>
  ),
  section: () => "text-sm font-semibold",
  accent: (i) => <span className={cn("mr-2 inline-block h-4 w-1 rounded-full align-[-2px]", SECTION_ACCENT[i])} />,
  header: (p) => (
    <span className="inline-flex flex-col items-center gap-1">
      <span className="flex size-8 items-center justify-center rounded-full bg-slate-800 font-semibold text-[11px] text-white">{initials(p.name)}</span>
      <span className="text-[11px] text-slate-600">{p.name.split(" ")[0]}</span>
    </span>
  ),
};

const LOOKS: Record<Design, Look> = { signal, heatmap, bars };

export function SkillsMatrixDesign({
  design,
  people,
  skills,
  viewerId,
}: {
  readonly design: Design;
  readonly people: readonly Person[];
  readonly skills: readonly SkillRow[];
  readonly viewerId: string | null;
}) {
  const look = LOOKS[design];
  const names = (category: SkillRow["category"]) => [...new Set(skills.filter((s) => s.category === category).map((s) => s.name))];
  const find = (personId: string, category: string, name: string) => skills.find((s) => s.person_id === personId && s.category === category && s.name === name);
  const mine = (personId: string) => personId === viewerId && "bg-amber-50/70";
  const sections: { title: string; category: SkillRow["category"] }[] = [
    { title: "Product skills", category: "product" },
    { title: "Certifications", category: "certification" },
    { title: "Soft skills", category: "enablement" },
  ];
  const namesRow = (
    <tr>
      <th className="sticky left-0 min-w-52 bg-card px-4 py-3 text-left font-medium text-muted-foreground text-xs">Skill</th>
      {people.map((p) => (
        <th className={cn("px-2 py-3 text-center font-medium text-slate-700 text-xs", mine(p.id))} key={p.id}>
          {look.header(p)}
        </th>
      ))}
    </tr>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-muted-foreground text-xs">{look.legend}</div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>{namesRow}</thead>
          {sections.map((section, index) => (
            <tbody key={section.category}>
              <tr>
                <th className="sticky left-0 border-t bg-card px-4 pt-5 pb-2 text-left" colSpan={1}>
                  {look.accent?.(index)}
                  <span className={look.section(section.title, index)}>{section.title}</span>
                </th>
                <td className="border-t" colSpan={people.length} />
              </tr>
              {names(section.category).map((name) => (
                <tr className="group" key={name}>
                  <td className="sticky left-0 bg-card px-4 py-2 text-slate-700 group-hover:bg-slate-50">{name}</td>
                  {people.map((p) => {
                    const skill = find(p.id, section.category, name);
                    const level = skill?.level ?? 0;
                    return (
                      <td
                        className={cn("px-2 py-2 text-center group-hover:bg-slate-50", mine(p.id))}
                        key={p.id}
                        title={
                          section.category === "product"
                            ? `${p.name}: ${SKILL_LEVEL_MEANING[skillLevelName(level)]}`
                            : skill
                              ? `${p.name}: ${STATUS_LABEL[(skill.status ?? "not_started") as Status]}${skill.completed_on ? `, ${skill.completed_on}` : skill.due_on ? `, due ${skill.due_on}` : ""}`
                              : undefined
                        }
                      >
                        {section.category === "product" ? look.level(level) : look.status(skill ? ((skill.status ?? "not_started") as Status) : null)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot>{namesRow}</tfoot>
        </table>
      </div>
    </div>
  );
}
