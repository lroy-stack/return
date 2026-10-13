import { type ChangeEvent, useState } from "react";
import type { SystemStatus } from "../../../shared/schemas";
import { api } from "../../lib/api";
import type { MessageKey } from "../../lib/dict";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useFormat } from "../../lib/settings-context";
import { Badge } from "../../ui/Badge";
import { Button, ButtonLink } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { ErrorState, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { SectionCard } from "./shared";

const CHECKS = [
  "database",
  "storage",
  "accessConfigured",
  "turnstileConfigured",
  "emailConfigured",
  "fallbackContactConfigured",
] as const;

export function SystemSection() {
  const t = useT();
  const format = useFormat();
  const toast = useToast();
  const res = useResource<SystemStatus>("system", (signal) => api.get<SystemStatus>("/system", signal));
  const [restoreData, setRestoreData] = useState<unknown>(null);
  const [restoreName, setRestoreName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    setRestoreData(null);
    setRestoreName(null);
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      setRestoreData(parsed);
      setRestoreName(file.name);
    } catch {
      setFileError(t("system.restoreInvalid"));
    }
  };

  if (res.state.status === "loading") return <LoadingBlock />;
  if (res.state.status === "error")
    return <ErrorState error={res.state.error} onRetry={() => res.reload()} />;
  const s = res.state.data;
  const empty = s.counts.items === 0;

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title={t("settings.system")} description={t("settings.systemDesc")}>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Info label={t("system.version")} value={s.version} />
          <Info label={t("system.environment")} value={s.environment} />
          <Info label={t("system.appOrigin")} value={s.appOrigin ?? t("system.notSet")} />
          <Info label={t("system.publicOrigin")} value={s.publicOrigin ?? t("system.notSet")} />
          <Info
            label={t("system.counts")}
            value={t("system.countsValue", {
              items: s.counts.items,
              tags: s.counts.tags,
              open: s.counts.openConversations,
            })}
          />
          <Info
            label={t("system.lastBackup")}
            value={s.lastBackupAt ? format.dateTime(s.lastBackupAt) : t("system.noBackup")}
          />
          <Info
            label={t("system.notifFailures")}
            value={String(s.recentNotificationFailures)}
            warn={s.recentNotificationFailures > 0}
          />
        </dl>
      </SectionCard>

      <SectionCard title={t("system.checks")}>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {CHECKS.map((c) => {
            const ok = s.checks[c];
            return (
              <li key={c} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{t(`system.check.${c}` as const)}</p>
                  {!ok ? <p className="text-sm text-muted">{t(`system.fix.${c}` as MessageKey)}</p> : null}
                </div>
                {ok ? (
                  <Badge tone="success" icon="check">
                    {t("system.ok")}
                  </Badge>
                ) : (
                  <Badge tone="lost" icon="alert">
                    {t("system.needsSetup")}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </SectionCard>

      <SectionCard title={t("system.backup")} description={t("system.backupDesc")}>
        <div>
          <ButtonLink to="/api/data/export" download="return-backup.json" icon="download">
            {t("system.export")}
          </ButtonLink>
        </div>
        <div className="border-t border-line pt-4">
          <h3 className="font-semibold">{t("system.restore")}</h3>
          {empty ? (
            <p className="mb-3 text-sm text-muted">{t("system.restoreHint")}</p>
          ) : (
            <p className="mb-3 flex gap-2 rounded-xl bg-sunken px-3 py-2 text-sm text-muted">
              <Icon name="lock" className="mt-0.5 size-4" />
              {t("system.restoreLocked")}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="restore-file" className="text-sm font-medium">
              {t("system.restoreFile")}
            </label>
            <input
              id="restore-file"
              type="file"
              accept="application/json,.json"
              disabled={!empty}
              onChange={onFile}
              className="block w-full rounded-xl border border-line-strong bg-raised p-2 text-sm file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:text-primary-fg disabled:opacity-55"
            />
            <p role="alert" className="text-sm font-medium text-danger empty:hidden">
              {fileError}
            </p>
          </div>
          <div className="mt-3">
            <Button
              variant="danger"
              icon="refresh"
              disabled={!empty || restoreData === null}
              onClick={() => setConfirming(true)}
            >
              {t("system.restoreButton")}
            </Button>
          </div>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirming}
        title={t("system.restoreTitle")}
        message={t("system.restoreBody", { name: restoreName ?? "" })}
        confirmLabel={t("system.restoreButton")}
        typed="RESTORE"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await api.post("/data/import", { confirm: "RESTORE", data: restoreData });
          toast(t("system.restored"));
          setRestoreData(null);
          setRestoreName(null);
          res.reload(true);
        }}
      />
    </div>
  );
}

function Info({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`font-medium ${warn ? "text-lost" : ""}`}>{value}</dd>
    </div>
  );
}
