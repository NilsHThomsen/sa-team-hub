// The person filter lives in the URL (?people=priya-nair,tom-becker), so a
// filtered view can be bookmarked or shared, and it carries across tabs.
// It only narrows what the viewer can already see: the data layer still
// decides that, so filtering can never reveal someone else's rows.

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const PEOPLE_PARAM = "people";

/** Selected person ids, or null when no filter is set (show everyone). */
export async function selectedPeople(searchParams: SearchParams): Promise<ReadonlySet<string> | null> {
  const raw = (await searchParams)[PEOPLE_PARAM];
  const ids = (Array.isArray(raw) ? raw.join(",") : (raw ?? "")).split(",").filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

/** Keeps rows for the selected people; passes everything through when no filter is set. */
export function byPeople<T>(rows: readonly T[], selected: ReadonlySet<string> | null, personId: (row: T) => string | null): T[] {
  return selected ? rows.filter((r) => {
    const id = personId(r);
    return id !== null && selected.has(id);
  }) : [...rows];
}
