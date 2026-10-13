import { useCallback, useEffect, useRef, useState } from "react";
import { deviceLabel } from "../../../shared/push-client";
import type { PushSubscriptionView, PushTestResult } from "../../../shared/schemas";
import { api } from "../../lib/api";
import type { MessageKey } from "../../lib/dict";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { type DevicePush, readPushEnvironment, useDevicePush } from "../../lib/push";
import { useFormat } from "../../lib/settings-context";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { TextInput, Toggle } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { List, ListRow } from "../../ui/List";
import { EmptyState, errorMessage, LoadingBlock } from "../../ui/States";
import { SectionCard, type SectionProps } from "./shared";

const STATE_TEXT: Record<Exclude<DevicePush["state"], "loading" | "off" | "on">, MessageKey> = {
  unsupported: "push.unsupported",
  "ios-install": "push.iosInstall",
  denied: "push.denied",
};

const TEST_TEXT: Record<PushTestResult["code"], MessageKey> = {
  sent: "push.test.sent",
  not_configured: "push.test.notConfigured",
  no_subscriptions: "push.test.noDevices",
  failed: "push.test.failed",
};

function Notice({ ok, children }: { ok: boolean; children: string }) {
  return (
    <p
      className={`flex items-start gap-2 rounded-control px-3 py-2 font-medium ${ok ? "bg-accent-tint text-accent-text" : "bg-danger-tint text-danger"}`}
    >
      <Icon name={ok ? "check" : "alert"} className="mt-0.5 shrink-0" />
      {children}
    </p>
  );
}

/** Settings > Notifications: this device's push opt-in, preferences, the owner's devices and a test button. */
export function PushDevices({ draft, instant }: Pick<SectionProps, "draft" | "instant">) {
  const t = useT();
  const format = useFormat();
  const list = useResource<PushSubscriptionView[]>(
    "push-devices",
    async (signal) =>
      (await api.get<{ subscriptions: PushSubscriptionView[] }>("/push/subscriptions", signal)).subscriptions,
  );
  const reloadRef = useRef(list.reload);
  reloadRef.current = list.reload;
  const onChanged = useCallback(() => reloadRef.current(true), []);
  const devices = list.state.status === "ready" ? list.state.data : null;
  const push = useDevicePush(onChanged, devices);

  const [label, setLabel] = useState(() => deviceLabel(readPushEnvironment()));
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<unknown>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  // Show the saved name of this device once it is known.
  const mine = devices?.find((d) => d.id === push.deviceId);
  const savedLabel = mine?.label ?? null;
  useEffect(() => {
    if (savedLabel) setLabel(savedLabel);
  }, [savedLabel]);

  const remove = async (device: PushSubscriptionView) => {
    setRemoving(device.id);
    setRemoveError(null);
    try {
      if (device.id === push.deviceId) await push.disable();
      else {
        await api.delete(`/push/subscriptions/${device.id}`);
        list.reload(true);
      }
    } catch (e) {
      setRemoveError(e);
    } finally {
      setRemoving(null);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const res = await api.post<PushTestResult>("/push/test");
      const failed = res.results.filter((r) => r.status !== "sent");
      const detail = res.code === "failed" && failed[0]?.error ? ` (${failed[0].error})` : "";
      setTest({ ok: res.ok, text: `${t(TEST_TEXT[res.code], { n: res.results.length })}${detail}` });
      list.reload(true);
    } catch (e) {
      setTest({ ok: false, text: errorMessage(e, t) });
    } finally {
      setTesting(false);
    }
  };

  const n = draft.notifications.push;
  const renamed = push.state === "on" && label.trim() !== (savedLabel ?? "");

  return (
    <>
      <SectionCard title={t("push.title")} description={t("push.desc")}>
        {push.state === "loading" ? <LoadingBlock rows={1} /> : null}
        {push.state !== "loading" && push.state !== "off" && push.state !== "on" ? (
          <p className="text-subhead text-muted">{t(STATE_TEXT[push.state])}</p>
        ) : null}
        {push.state === "off" || push.state === "on" ? (
          <>
            <TextInput
              label={t("push.deviceName")}
              hint={t("push.deviceNameHint")}
              value={label}
              maxLength={80}
              onChange={(e) => setLabel(e.target.value)}
            />
            {!push.serverReady ? <Notice ok={false}>{t("push.serverNotReady")}</Notice> : null}
            <div className="flex flex-wrap items-center gap-3">
              {push.state === "off" ? (
                <Button
                  variant="primary"
                  icon="send"
                  loading={push.busy}
                  disabled={!push.serverReady}
                  onClick={() => void push.enable(label)}
                >
                  {t("push.enable")}
                </Button>
              ) : (
                <>
                  <Badge tone="success" icon="check">
                    {t("push.on")}
                  </Badge>
                  {renamed ? (
                    <Button size="sm" loading={push.busy} onClick={() => void push.rename(label)}>
                      {t("push.saveName")}
                    </Button>
                  ) : null}
                  <Button variant="danger-soft" loading={push.busy} onClick={() => void push.disable()}>
                    {t("push.disable")}
                  </Button>
                </>
              )}
            </div>
          </>
        ) : null}
        {push.error ? (
          <p role="alert" className="text-subhead font-medium text-danger">
            {errorMessage(push.error, t)}
          </p>
        ) : null}
        <div className="border-t border-line pt-4">
          <Toggle
            label={t("push.prefEnabled")}
            description={t("push.prefEnabledHint")}
            checked={n.enabled}
            onChange={(on) =>
              instant((d) => {
                d.notifications.push.enabled = on;
              })
            }
          />
          <Toggle
            label={t("push.prefItemName")}
            description={t("push.prefItemNameHint")}
            checked={n.showItemName}
            onChange={(on) =>
              instant((d) => {
                d.notifications.push.showItemName = on;
              })
            }
          />
        </div>
      </SectionCard>

      <SectionCard title={t("push.devices")} description={t("push.devicesDesc")}>
        {list.state.status === "loading" ? <LoadingBlock rows={2} variant="rows" /> : null}
        {list.state.status === "error" ? (
          <p role="alert" className="text-subhead font-medium text-danger">
            {errorMessage(list.state.error, t)}
          </p>
        ) : null}
        {devices && devices.length === 0 ? (
          <EmptyState compact icon="phone" title={t("push.noDevices")}>
            {t("push.noDevicesHint")}
          </EmptyState>
        ) : null}
        {devices && devices.length > 0 ? (
          <List label={t("push.devices")}>
            {devices.map((d) => (
              <ListRow
                key={d.id}
                title={d.label ?? t("push.unnamed")}
                subtitle={
                  d.lastSuccessAt
                    ? t("push.lastDelivery", { when: format.dateTime(d.lastSuccessAt) })
                    : t("push.neverDelivered")
                }
                description={d.failures > 0 ? t("push.failing", { n: d.failures }) : undefined}
                trailing={
                  d.id === push.deviceId ? <Badge tone="info">{t("push.thisDevice")}</Badge> : undefined
                }
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={removing === d.id}
                    aria-label={t("push.removeNamed", { name: d.label ?? t("push.unnamed") })}
                    onClick={() => void remove(d)}
                  >
                    {t("push.remove")}
                  </Button>
                }
              />
            ))}
          </List>
        ) : null}
        {removeError ? (
          <p role="alert" className="text-subhead font-medium text-danger">
            {errorMessage(removeError, t)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button icon="send" loading={testing} onClick={sendTest}>
            {t("push.sendTest")}
          </Button>
        </div>
        <div aria-live="polite">{test ? <Notice ok={test.ok}>{test.text}</Notice> : null}</div>
      </SectionCard>
    </>
  );
}
