"use client";

import { useState, useTransition } from "react";
import { answerPromotionCase } from "./actions";

/** Approve / Decline for a drafted promotion case waiting on the manager. */
export function PromotionButtons({ id }: { readonly id: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const answer = (approve: boolean) =>
    start(async () => {
      const result = await answerPromotionCase(id, approve);
      setError(result.error);
    });
  return (
    <div className="mt-2 flex items-center gap-2">
      <button className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground text-xs disabled:opacity-50" disabled={pending} onClick={() => answer(true)} type="button">
        Approve
      </button>
      <button className="rounded-md border px-2.5 py-1 text-xs disabled:opacity-50" disabled={pending} onClick={() => answer(false)} type="button">
        Decline
      </button>
      {error ? <span className="text-red-600 text-xs">{error}</span> : null}
    </div>
  );
}
