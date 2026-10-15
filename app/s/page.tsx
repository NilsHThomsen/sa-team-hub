import { AgentChat } from "@/app/_components/agent-chat";
import { examplePrompts } from "@/lib/examples";
import { requireActor } from "@/lib/viewer";

// Cache Components: the chat page reads the sign-in cookie, so this route renders at request time.
// `instant = false` allows that (the documented opt-out); cached pieces such
// as the weekly digest still opt in with "use cache".
export const instant = false;

export default async function NewSessionPage() {
  const { viewer } = await requireActor();
  return <AgentChat examples={examplePrompts(viewer.role)} sessionless />;
}
