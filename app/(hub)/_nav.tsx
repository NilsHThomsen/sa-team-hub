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
    <nav className="flex flex-wrap gap-4 text-sm">
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
