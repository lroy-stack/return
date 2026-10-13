import { useState } from "react";
import { api } from "../../lib/api";
import { isoToLocalInput, localInputToIso } from "../../lib/format";
import { useT } from "../../lib/i18n";
import { useFormat, useSettings } from "../../lib/settings-context";
import { Button } from "../../ui/Button";
import { TextInput, Toggle } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { errorMessage } from "../../ui/States";
import { SectionCard, type SectionProps } from "./shared";

const EVENTS = ["newConversation", "newMessage", "locationShared", "proposal", "lostItemScanned"] as const;

export function NotificationsSection({ draft, update, errors, dirty }: SectionProps & { dirty: boolean }) {
  const t = useT();
  const format = useFormat();
  const { settings } = useSettings();
  const n = draft.notifications;
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const sendTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await api.post<{ ok: boolean; error?: string }>("/settings/test-email");
      setResult(
        res.ok
          ? {
              ok: true,
              text: t("notif.testOk", {
                email: settings.notifications.emailAddress ?? settings.contact.email ?? "",
              }),
            }
          : { ok: false, text: res.error ?? t("error.generic") },
      );
    } catch (e) {
      setResult({ ok: false, text: errorMessage(e, t) });
    } finally {
      setTesting(false);
    }
  };

  const muteFor = (hours: number | null) =>
    update((d) => {
      d.notifications.mutedUntil =
        hours === null ? null : new Date(Date.now() + hours * 3600_000).toISOString();
    });
  const muted = n.mutedUntil !== null && new Date(n.mutedUntil).getTime() > Date.now();

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title={t("settings.notifications")} description={t("settings.notificationsDesc")}>
        <Toggle
          label={t("notif.enable")}
          checked={n.emailEnabled}
          onChange={(on) =>
            update((d) => {
              d.notifications.emailEnabled = on;
            })
          }
        />
        <TextInput
          label={t("notif.address")}
          type="email"
          hint={t("notif.addressHint")}
          value={n.emailAddress ?? ""}
          onChange={(e) =>
            update((d) => {
              d.notifications.emailAddress = e.target.value.trim() || null;
            })
          }
          error={errors["notifications.emailAddress"]}
          autoComplete="email"
        />
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{t("notif.events")}</legend>
          {EVENTS.map((ev) => (
            <Toggle
              key={ev}
              label={t(`notif.event.${ev}` as const)}
              checked={n.events[ev]}
              onChange={(on) =>
                update((d) => {
                  d.notifications.events[ev] = on;
                })
              }
            />
          ))}
        </fieldset>
        <fieldset className="rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{t("notif.mute")}</legend>
          <p className="mb-2 text-sm" aria-live="polite">
            {muted && n.mutedUntil
              ? t("notif.mutedUntil", { when: format.dateTime(n.mutedUntil) })
              : t("notif.notMuted")}
          </p>
          <div className="mb-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => muteFor(8)}>
              {t("notif.mute8h")}
            </Button>
            <Button size="sm" onClick={() => muteFor(24)}>
              {t("notif.mute24h")}
            </Button>
            <Button size="sm" onClick={() => muteFor(24 * 7)}>
              {t("notif.mute7d")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => muteFor(null)} disabled={n.mutedUntil === null}>
              {t("notif.unmute")}
            </Button>
          </div>
          <TextInput
            label={t("notif.muteCustom")}
            type="datetime-local"
            value={isoToLocalInput(n.mutedUntil)}
            onChange={(e) =>
              update((d) => {
                d.notifications.mutedUntil = localInputToIso(e.target.value);
              })
            }
            error={errors["notifications.mutedUntil"]}
          />
        </fieldset>
        <Toggle
          label={t("notif.notifyFinders")}
          description={t("notif.notifyFindersHint")}
          checked={n.notifyFinders}
          onChange={(on) =>
            update((d) => {
              d.notifications.notifyFinders = on;
            })
          }
        />
      </SectionCard>

      <SectionCard title={t("notif.testTitle")} description={t("notif.testDesc")}>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon="send" loading={testing} onClick={sendTest}>
            {t("notif.sendTest")}
          </Button>
          {dirty ? <span className="text-sm text-muted">{t("notif.saveFirst")}</span> : null}
        </div>
        <div aria-live="polite">
          {result ? (
            <p
              className={`flex items-start gap-2 rounded-xl px-3 py-2 font-medium ${result.ok ? "bg-accent-tint text-accent-text" : "bg-danger-tint text-danger"}`}
            >
              <Icon name={result.ok ? "check" : "alert"} className="mt-0.5" />
              {result.text}
            </p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
