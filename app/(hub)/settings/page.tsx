import { isManager } from "@/agent/lib/actor";
import { getModelSetting, listSlackLinks } from "@/agent/lib/data";
import { fallbackFor, MODEL_OPTIONS, modelLabel } from "@/agent/lib/models";
import { Button } from "@/components/ui/button";
import { requireActor } from "@/lib/viewer";
import { ManagerOnly, PageHeader, Section, Table, Td } from "../_ui";
import { savePrimaryModel, saveSlackLink } from "./actions";

export default async function SettingsPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { actor } = await requireActor();
  // Hidden from ICs in the nav; check again for a typed URL. The data layer refuses them too.
  if (!isManager(actor)) return <ManagerOnly />;

  const [setting, links, params] = await Promise.all([getModelSetting(actor), listSlackLinks(actor), searchParams]);

  return (
    <>
      <PageHeader subtitle="Team-wide settings for the agent and the Slack bot." title="Settings" />
      <Section note="Routed through AI Gateway" title="Primary model">
        <form action={savePrimaryModel} className="space-y-4 rounded-xl border bg-card p-4">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-muted-foreground text-sm">
              Used for new chats, the Friday digest and promotion cases. Chats already open keep the model they started with.
            </legend>
            {MODEL_OPTIONS.map((m) => (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-foreground/40 has-[:checked]:bg-muted/40" key={m.id}>
                <input className="mt-1" defaultChecked={m.id === setting.model} name="model" type="radio" value={m.id} />
                <span>
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-2 font-mono text-muted-foreground text-xs">{m.id}</span>
                  <span className="block text-muted-foreground text-sm">
                    {m.note} Falls back to {modelLabel(fallbackFor(m.id))} if unavailable.
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex items-center gap-3">
            <Button type="submit">Save</Button>
            {params.saved ? <span className="text-emerald-600 text-sm">Saved. New chats will use {modelLabel(setting.model)}.</span> : null}
            {!params.saved && setting.updated_by_name ? (
              <span className="text-muted-foreground text-xs">
                Last changed by {setting.updated_by_name}, {setting.updated_at}
              </span>
            ) : null}
          </div>
        </form>
      </Section>

      <Section note="Only linked people can use the Slack bot" title="Slack accounts">
        <div className="space-y-3" id="slack">
          <p className="text-muted-foreground text-sm">
            Paste each person&apos;s Slack member ID (in Slack: their profile, then ⋯, then Copy member ID). In a direct message the bot gives them
            the same access as the web app. In any shared channel everyone, managers included, gets SA-level access only, so talent data never
            appears where others can read it.
          </p>
          {params.slackError ? <p className="text-red-600 text-sm">{String(params.slackError)}</p> : null}
          {params.slackSaved ? <p className="text-emerald-600 text-sm">Saved.</p> : null}
          <Table head={["Person", "Role", "Slack member ID"]}>
            {links.map((p) => (
              <tr key={p.id}>
                <Td className="whitespace-nowrap">{p.name}</Td>
                <Td className="text-muted-foreground">{p.role === "manager" ? "Manager" : "SA"}</Td>
                <Td>
                  <form action={saveSlackLink} className="flex items-center gap-2">
                    <input name="personId" type="hidden" value={p.id} />
                    <input
                      aria-label={`Slack member ID for ${p.name}`}
                      className="w-40 rounded-md border bg-background px-2 py-1 font-mono text-sm"
                      defaultValue={p.slack_user_id ?? ""}
                      name="slackUserId"
                      placeholder="Not linked"
                    />
                    <Button size="sm" type="submit" variant="outline">
                      Save
                    </Button>
                  </form>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      </Section>
    </>
  );
}
