import { AgentChat } from "@/app/_components/agent-chat";
import { examplePrompts } from "@/lib/examples";
import { requireActor } from "@/lib/viewer";

export default async function NewSessionPage() {
  const { viewer } = await requireActor();
  return <AgentChat examples={examplePrompts(viewer.role)} sessionless />;
}
