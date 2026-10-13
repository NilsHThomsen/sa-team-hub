"use client";

import { ChevronDownIcon, UsersIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PEOPLE_PARAM } from "@/lib/people-filter";

/** Multi-select person filter. Writes ?people=a,b to the URL; the server page does the filtering. */
export function PersonFilter({ people }: { readonly people: readonly { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = new Set((params.get(PEOPLE_PARAM) ?? "").split(",").filter(Boolean));

  const apply = (next: Set<string>) => {
    const q = new URLSearchParams(params.toString());
    if (next.size > 0) q.set(PEOPLE_PARAM, [...next].join(","));
    else q.delete(PEOPLE_PARAM);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    apply(next);
  };

  const names = people.filter((p) => selected.has(p.id)).map((p) => p.name.split(" ")[0]);
  const label = names.length === 0 ? "Everyone" : names.length <= 2 ? names.join(", ") : `${names.length} people`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-2" size="sm" variant={names.length > 0 ? "default" : "outline"}>
          <UsersIcon className="size-4" />
          {label}
          <ChevronDownIcon className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-56 overflow-y-auto">
        <DropdownMenuLabel>Filter by person</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {people.map((p) => (
          <DropdownMenuCheckboxItem
            checked={selected.has(p.id)}
            key={p.id}
            onCheckedChange={() => toggle(p.id)}
            onSelect={(e) => e.preventDefault()} // keep the menu open to pick several people
          >
            {p.name}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.size > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => apply(new Set())}>Clear filter</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
