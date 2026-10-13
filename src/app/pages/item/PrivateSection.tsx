import { useRef, useState } from "react";
import type { ItemDetail } from "../../../shared/schemas";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { useFormat } from "../../lib/settings-context";
import { Button, IconButton } from "../../ui/Button";
import { Section } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { KeyValue } from "../../ui/KeyValue";
import { IconTile, List, ListRow } from "../../ui/List";
import { errorMessage } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { uploadFile } from "./Gallery";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Serial, value, notes and documents: collapsed by default so private data is never on show by accident. */
export function PrivateSection({
  detail,
  onChanged,
  onEdit,
  className,
}: {
  detail: ItemDetail;
  onChanged: () => void;
  onEdit: () => void;
  className?: string;
}) {
  const t = useT();
  const format = useFormat();
  const toast = useToast();
  const { item } = detail;
  const docs = detail.files.filter((f) => f.kind === "document");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const empty =
    !item.serialNumber && item.estimatedValueCents == null && !item.acquiredOn && !item.privateNotes;

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) await uploadFile(item.id, "document", file);
      toast(t("private.docUploaded"));
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
      onChanged();
    }
  };

  return (
    <>
      <Section
        id="sec-private"
        className={className}
        collapsible
        title={t("private.title")}
        description={t("private.neverShown")}
        summary={docs.length > 0 ? t("private.docsCount", { n: docs.length }) : undefined}
        actions={
          <Button size="sm" variant="tinted" icon="edit" onClick={onEdit}>
            {t("common.edit")}
          </Button>
        }
      >
        {empty ? (
          <p className="text-subhead text-muted">{t("private.empty")}</p>
        ) : (
          <KeyValue
            layout="inline"
            entries={[
              { key: "serial", label: t("itemForm.serial"), value: item.serialNumber, mono: true },
              {
                key: "value",
                label: t("itemForm.value"),
                value:
                  item.estimatedValueCents != null
                    ? format.money(item.estimatedValueCents, item.currency)
                    : null,
              },
              {
                key: "acquired",
                label: t("itemForm.acquiredOn"),
                value: item.acquiredOn ? format.date(`${item.acquiredOn}T12:00:00Z`) : null,
              },
              { key: "notes", label: t("itemForm.privateNotes"), value: item.privateNotes },
            ].filter((e) => e.value)}
          />
        )}

        <h3 className="mt-2 text-subhead font-semibold">{t("private.documents")}</h3>
        {docs.length === 0 ? (
          <p className="text-subhead text-muted">{t("private.noDocs")}</p>
        ) : (
          <List variant="plain" label={t("private.documents")}>
            {docs.map((d) => (
              <ListRow
                key={d.id}
                flush
                leading={
                  <IconTile tone="neutral">
                    <Icon name="documents" className="size-5" />
                  </IconTile>
                }
                title={
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={d.filename}
                    className="inline-flex max-w-full min-w-0 items-center align-top text-primary-text hover:underline pointer-coarse:min-h-11"
                  >
                    <span className="min-w-0 truncate">{d.filename}</span>
                    <span className="sr-only"> ({t("common.opensNewTab")})</span>
                  </a>
                }
                subtitle={formatSize(d.sizeBytes)}
                trailing={
                  <IconButton
                    icon="trash"
                    size="sm"
                    label={t("private.removeDoc", { name: d.filename })}
                    onClick={() => setRemoveId(d.id)}
                  />
                }
              />
            ))}
          </List>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            aria-label={t("private.addDoc")}
            multiple
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => void onFiles(e.target.files)}
          />
          <Button size="sm" icon="plus" loading={uploading} onClick={() => input.current?.click()}>
            {t("private.addDoc")}
          </Button>
          <span className="text-footnote text-muted">{t("private.docHint")}</span>
        </div>
        <p role="alert" className="text-subhead font-medium text-danger empty:hidden">
          {error}
        </p>
      </Section>
      <ConfirmDialog
        open={removeId !== null}
        title={t("private.removeTitle")}
        message={t("private.removeBody")}
        confirmLabel={t("common.delete")}
        onClose={() => setRemoveId(null)}
        onConfirm={async () => {
          if (!removeId) return;
          await api.delete(`/files/${removeId}`);
          onChanged();
        }}
      />
    </>
  );
}
