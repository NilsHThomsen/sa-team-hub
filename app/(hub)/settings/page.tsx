import { isManager } from "@/agent/lib/actor";
import { getModelSetting } from "@/agent/lib/data";
import { fallbackFor, MODEL_OPTIONS, modelLabel } from "@/agent/lib/models";
import { Button } from "@/components/ui/button";
import { requireActor } from "@/lib/viewer";
import { ManagerOnly, PageHeader, Section } from "../_ui";
import { savePrimaryModel } from "./actions";

export default async function SettingsPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { actor } = await requireActor();
  // Hidden from ICs in the nav; check again for a typed URL. The data layer refuses them too.
  if (!isManager(actor)) return <ManagerOnly />;

  const [setting, params] = await Promise.all([getModelSetting(actor), searchParams]);

  return (
    <>
      <PageHeader subtitle="Team-wide settings for the agent." title="Settings" />
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
    </>
  );
}
