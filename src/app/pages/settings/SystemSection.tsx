import { type ChangeEvent, useState } from "react";
import type { SystemStatus } from "../../../shared/schemas";
import { api } from "../../lib/api";
import type { MessageKey } from "../../lib/dict";
import { useResource } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useFormat } from "../../lib/settings-context";
import { Badge } from "../../ui/Badge";
import { Button, ButtonLink } from "../../ui/Button";
import { Section } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { KeyValue } from "../../ui/KeyValue";
import { List, ListRow } from "../../ui/List";
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
    <div className="flex flex-col gap-6">
      <SectionCard title={t("settings.system")} description={t("settings.systemDesc")}>
        <KeyValue
          layout="grid"
          entries={[
            { key: "version", label: t("system.version"), value: s.version, mono: true },
            { key: "env", label: t("system.environment"), value: s.environment },
            {
              key: "app",
              label: t("system.appOrigin"),
              value: s.appOrigin,
              empty: t("system.notSet"),
              mono: true,
            },
            {
              key: "public",
              label: t("system.publicOrigin"),
              value: s.publicOrigin,
              empty: t("system.notSet"),
              mono: true,
            },
            {
              key: "counts",
              label: t("system.counts"),
              value: [
                t("system.items", { n: s.counts.items }),
                t("system.tagsCount", { n: s.counts.tags }),
                t("system.openConvs", { n: s.counts.openConversations }),
              ].join(", "),
            },
            {
              key: "backup",
              label: t("system.lastBackup"),
              value: s.lastBackupAt ? format.dateTime(s.lastBackupAt) : t("system.noBackup"),
            },
            {
              key: "failures",
              label: t("system.notifFailures"),
              value: String(s.recentNotificationFailures),
              tone: s.recentNotificationFailures > 0 ? "warning" : "default",
            },
          ]}
        />
        <div>
          <ButtonLink to="/gallery" icon="eye" size="sm">
            {t("system.gallery")}
          </ButtonLink>
        </div>
      </SectionCard>

      <Section title={t("system.checks")}>
        <List label={t("system.checks")}>
          {CHECKS.map((c) => {
            const ok = s.checks[c];
            return (
              <ListRow
                key={c}
                title={t(`system.check.${c}` as const)}
                description={ok ? undefined : t(`system.fix.${c}` as MessageKey)}
                trailing={
                  ok ? (
                    <Badge tone="success" icon="check">
                      {t("system.ok")}
                    </Badge>
                  ) : (
                    <Badge tone="warning" icon="alert">
                      {t("system.needsSetup")}
                    </Badge>
                  )
                }
              />
            );
          })}
        </List>
      </Section>

      <SectionCard title={t("system.backup")} description={t("system.backupDesc")}>
        <div>
          <ButtonLink to="/api/data/export" download="return-backup.json" icon="download">
            {t("system.export")}
          </ButtonLink>
        </div>
        <div className="border-t border-line pt-4">
          <h3 className="font-semibold">{t("system.restore")}</h3>
          {empty ? (
            <p className="mb-3 text-subhead text-muted">{t("system.restoreHint")}</p>
          ) : (
            <p className="mb-3 flex gap-2 rounded-control bg-sunken px-3 py-2 text-subhead text-muted">
              <Icon name="lock" className="mt-0.5 size-4" />
              {t("system.restoreLocked")}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="restore-file" className="text-subhead font-medium">
              {t("system.restoreFile")}
            </label>
            <input
              id="restore-file"
              type="file"
              accept="application/json,.json"
              disabled={!empty}
              onChange={onFile}
              className="block w-full rounded-control border border-line-strong bg-raised p-2 text-subhead file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:text-primary-fg disabled:opacity-55"
            />
            <p role="alert" className="text-subhead font-medium text-danger empty:hidden">
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
