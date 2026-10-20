"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { PEOPLE_PARAM } from "@/lib/people-filter";

/** Top nav that carries the person filter from tab to tab. */
export function NavLinks({ items }: { readonly items: readonly { href: string; label: string }[] }) {
  const pathname = usePathname();
  const people = useSearchParams().get(PEOPLE_PARAM);
  const suffix = people ? `?${PEOPLE_PARAM}=${encodeURIComponent(people)}` : "";
  return (
    // On a phone the tabs get their own full-width row that scrolls sideways, so the
    // sticky header stays one short strip instead of wrapping onto three lines.
    <nav className="-mx-4 order-last flex basis-[calc(100%+2rem)] gap-4 overflow-x-auto whitespace-nowrap px-4 pb-1 text-sm sm:order-none sm:mx-0 sm:basis-auto sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
      {items.map((item) => (
        <Link
          className={cn("hover:text-foreground", pathname === item.href ? "font-medium text-foreground" : "text-muted-foreground")}
          href={`${item.href}${suffix}`}
          key={item.href}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
