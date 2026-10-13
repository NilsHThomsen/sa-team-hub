"use client";

import { useState, useTransition } from "react";
import { CAREER_GOALS } from "@/agent/lib/career-goals";
import { updateCareerGoal } from "./actions";

/** Dropdown that saves a person's career goal as soon as it changes. */
export function CareerGoalPicker({ personId, personName, goal }: { readonly personId: string; readonly personName: string; readonly goal: string | null }) {
  const [value, setValue] = useState(goal ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const change = (next: string) => {
    const previous = value;
    setValue(next);
    setError(null);
    startTransition(async () => {
      const result = await updateCareerGoal(personId, next);
      if (result.error) {
        setValue(previous);
        setError(result.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={`Career goal for ${personName}`}
        className="rounded-md border bg-background px-2 py-1 text-sm disabled:opacity-60"
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        value={value}
      >
        {value === "" ? <option value="">Choose a goal…</option> : null}
        {CAREER_GOALS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      {pending ? <span className="text-muted-foreground text-xs">Saving…</span> : null}
      {error ? <span className="text-red-600 text-xs">{error}</span> : null}
    </div>
  );
}
