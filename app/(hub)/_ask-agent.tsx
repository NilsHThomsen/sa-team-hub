"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AgentChat } from "@/app/_components/agent-chat";
import { cn } from "@/lib/utils";
import { afterAgentTurn } from "./actions";

// "Ask the agent" opens the chat in a panel over the dashboard. The panel stays mounted while
// closed and across page changes, so a conversation survives moving between tabs.
export function AskAgent({ examples }: { readonly examples: readonly string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  const close = useCallback(() => setOpen(false), []);
  const newChat = useCallback(() => setChatKey((key) => key + 1), []);
  // After each agent turn, clear the cached digest (a Server Action) and re-render the dashboard,
  // so changes the agent made show up. A failed clear still refreshes.
  const refresh = useCallback(async () => {
    await afterAgentTurn().catch(() => undefined);
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        className="rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground"
        onClick={() => {
          setOpened(true);
          setOpen((value) => !value);
        }}
        type="button"
      >
        Ask the agent
      </button>
      <div
        aria-hidden
        className={cn(
          "fixed inset-0 z-30 bg-black/30 transition-opacity sm:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={close}
      />
      <aside
        aria-label="Agent chat"
        className={cn(
          "fixed top-0 right-0 z-40 h-dvh w-full border-l bg-background shadow-2xl transition-transform duration-200 sm:w-[440px]",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
        inert={!open}
      >
        {opened ? (
          <AgentChat
            examples={examples}
            key={chatKey}
            panel={{ onClose: close, onNewChat: newChat, onTurnSettled: refresh }}
            sessionless
          />
        ) : null}
      </aside>
    </>
  );
}
