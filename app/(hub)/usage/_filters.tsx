"use client";

import { ChevronDownIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FEATURES } from "@/lib/usage-features";

type Option = { readonly id: string; readonly name: string };

/**
 * Person, Model and Feature filters for AI Usage. One value each, because a
 * Gateway report filters on a single user and a single model. Writes
 * ?person=&model=&feature= to the URL; the server page checks the values.
 */
export function UsageFilters({ people, models }: { readonly people: readonly Option[]; readonly models: readonly Option[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Filter all="Everyone" options={people} param="person" title="Filter by person" />
      <Filter all="All models" options={models} param="model" title="Filter by model" />
      <Filter all="All features" options={FEATURES} param="feature" title="Filter by feature" />
    </div>
  );
}

function Filter({ param, title, all, options }: { readonly param: string; readonly title: string; readonly all: string; readonly options: readonly Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const value = params.get(param) ?? "";
  const selected = options.find((o) => o.id === value);

  const apply = (next: string) => {
    const q = new URLSearchParams(params.toString());
    if (next) q.set(param, next);
    else q.delete(param);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="gap-2" size="sm" variant={selected ? "default" : "outline"}>
          {selected?.name ?? all}
          <ChevronDownIcon className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 w-60 overflow-y-auto">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup onValueChange={apply} value={selected ? value : ""}>
          <DropdownMenuRadioItem value="">{all}</DropdownMenuRadioItem>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.id} value={o.id}>
              {o.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
