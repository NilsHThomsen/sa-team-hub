import { Suspense } from "react";
import { AgentChat } from "@/app/_components/agent-chat";
import { examplePrompts } from "@/lib/examples";
import { requireActor } from "@/lib/viewer";

// Cache Components: the page itself reads nothing personal, so the chat
// (without example prompts) is prerendered and served from the CDN. The
// sign-in check and the role's example prompts stream in behind Suspense;
// signed-out visitors are still redirected to /login.
export const instant = false;

export default function NewSessionPage() {
  return (
    <Suspense fallback={<AgentChat sessionless />}>
      <SignedInChat />
    </Suspense>
  );
}

async function SignedInChat() {
  const { viewer } = await requireActor();
  return <AgentChat examples={examplePrompts(viewer.role)} sessionless />;
}
