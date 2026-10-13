import { useEffect, useState } from "react";
import { type Settings, settingsSchema } from "../../../shared/settings";
import { ApiRequestError } from "../../lib/api";
import type { MessageKey } from "../../lib/dict";
import { type FieldErrors, validate } from "../../lib/forms";
import { useMediaQuery } from "../../lib/hooks";
import { useT } from "../../lib/i18n";
import { useSettings } from "../../lib/settings-context";
import { Button } from "../../ui/Button";
import type { IconName } from "../../ui/Icon";
import { Icon } from "../../ui/Icon";
import { IconTile, List, ListRow } from "../../ui/List";
import { PageHeader, Toolbar } from "../../ui/Page";
import { SplitView } from "../../ui/SplitView";
import { ErrorState, LoadingBlock } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { ActivitySection } from "./ActivitySection";
import { ContactSection } from "./ContactSection";
import { IdentitySection } from "./IdentitySection";
import { MessagesSection } from "./MessagesSection";
import { NotificationsSection } from "./NotificationsSection";
import { PrivacySection } from "./PrivacySection";
import { PublicPageSection } from "./PublicPageSection";
import { SystemSection } from "./SystemSection";
import { TagsSettingsSection } from "./TagsSettingsSection";

const SECTIONS: { key: string; label: MessageKey; icon: IconName; editable: boolean }[] = [
  { key: "identity", label: "settings.identity", icon: "user", editable: true },
  { key: "messages", label: "settings.messages", icon: "inbox", editable: true },
  { key: "contact", label: "settings.contact", icon: "phone", editable: true },
  { key: "notifications", label: "settings.notifications", icon: "send", editable: true },
  { key: "privacy", label: "settings.privacy", icon: "lock", editable: true },
  { key: "tags", label: "settings.tags", icon: "tag", editable: true },
  { key: "public", label: "settings.public", icon: "external", editable: true },
  { key: "activity", label: "settings.activity", icon: "refresh", editable: false },
  { key: "system", label: "settings.system", icon: "settings", editable: false },
];

export function SettingsPage({ section }: { section?: string }) {
  const t = useT();
  const toast = useToast();
  const split = useMediaQuery("(min-width: 768px)");
  const { state, settings, save, draft, setDraft, reload } = useSettings();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const active = SECTIONS.find((s) => s.key === section) ?? (split ? SECTIONS[0] : undefined);
  const current = draft ?? settings;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(settings);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (mutate: (d: Settings) => void) => {
    const next = structuredClone(current);
    mutate(next);
    setDraft(next);
  };

  const onSave = async () => {
    setFormError(null);
    const v = validate(settingsSchema, current);
    if (!v.ok) {
      setErrors(v.errors);
      setFormError(t("settings.invalid", { n: Object.keys(v.errors).length }));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await save(v.data);
      toast(t("settings.saved"));
    } catch (e) {
      if (e instanceof ApiRequestError) {
        setErrors(e.fieldErrors);
        setFormError(e.message);
      } else setFormError(t("error.generic"));
    } finally {
      setSaving(false);
    }
  };

  const header = (
    <PageHeader
      title={!split && active ? t(active.label) : t("nav.settings")}
      back={!split && active ? { to: "/settings", label: t("nav.settings") } : undefined}
    />
  );

  if (state.status === "loading") {
    return (
      <>
        {header}
        <LoadingBlock rows={4} />
      </>
    );
  }
  if (state.status === "error") {
    return (
      <>
        {header}
        <ErrorState error={state.error} onRetry={reload} />
      </>
    );
  }

  const props = { draft: current, update, errors };
  const nav = (
    <nav aria-label={t("settings.sections")}>
      <List>
        {SECTIONS.map((s) => (
          <ListRow
            key={s.key}
            to={`/settings/${s.key}`}
            current={split && active?.key === s.key}
            leading={
              <IconTile tone={s.key === "system" || s.key === "activity" ? "neutral" : "primary"}>
                <Icon name={s.icon} className="size-5" />
              </IconTile>
            }
            title={t(s.label)}
          />
        ))}
      </List>
    </nav>
  );

  return (
    <>
      {header}
      <SplitView
        listWidth="sm"
        listLabel={t("settings.nav")}
        detailLabel={t("settings.detail")}
        showDetail={Boolean(active)}
        placeholder={t("settings.selectHint")}
        list={nav}
        detail={
          active ? (
            <div className="min-w-0 pb-28">
              {active.key === "identity" ? <IdentitySection {...props} /> : null}
              {active.key === "messages" ? <MessagesSection {...props} /> : null}
              {active.key === "contact" ? <ContactSection {...props} /> : null}
              {active.key === "notifications" ? <NotificationsSection {...props} dirty={dirty} /> : null}
              {active.key === "privacy" ? <PrivacySection {...props} /> : null}
              {active.key === "tags" ? <TagsSettingsSection {...props} /> : null}
              {active.key === "public" ? <PublicPageSection {...props} /> : null}
              {active.key === "activity" ? <ActivitySection /> : null}
              {active.key === "system" ? <SystemSection /> : null}
            </div>
          ) : null
        }
      />

      {dirty ? (
        <Toolbar floating label={t("settings.unsaved")}>
          <div role="status" className="min-w-0">
            <p className="font-semibold">{t("settings.unsaved")}</p>
            {formError ? (
              <p className="flex items-center gap-1.5 text-footnote font-semibold">
                <Icon name="alert" className="size-4 text-danger" />
                {formError}
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setErrors({});
                setFormError(null);
              }}
            >
              {t("settings.discard")}
            </Button>
            <Button variant="primary" loading={saving} onClick={onSave}>
              {t("common.save")}
            </Button>
          </div>
        </Toolbar>
      ) : null}
    </>
  );
}
