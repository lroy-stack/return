import { useRef, useState } from "react";
import type { ItemDetail } from "../../../shared/schemas";
import { ItemFormSheet } from "../../components/ItemFormSheet";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { useFormat } from "../../lib/settings-context";
import { Button } from "../../ui/Button";
import { Card, SectionHeading } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { errorMessage } from "../../ui/States";
import { useToast } from "../../ui/Toast";
import { uploadFile } from "./Gallery";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PrivateSection({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const t = useT();
  const format = useFormat();
  const toast = useToast();
  const { item } = detail;
  const docs = detail.files.filter((f) => f.kind === "document");
  const [editing, setEditing] = useState(false);
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
    <Card aria-labelledby="sec-private" className="border-line-strong">
      <SectionHeading
        id="sec-private"
        icon={<Icon name="lock" className="size-5 text-muted" />}
        title={t("private.title")}
        description={t("private.neverShown")}
        actions={
          <Button size="sm" icon="edit" onClick={() => setEditing(true)}>
            {t("common.edit")}
          </Button>
        }
      />
      {empty ? (
        <p className="text-muted">{t("private.empty")}</p>
      ) : (
        <dl className="divide-y divide-line">
          {item.serialNumber ? <Row label={t("itemForm.serial")}>{item.serialNumber}</Row> : null}
          {item.estimatedValueCents != null ? (
            <Row label={t("itemForm.value")}>{format.money(item.estimatedValueCents, item.currency)}</Row>
          ) : null}
          {item.acquiredOn ? (
            <Row label={t("itemForm.acquiredOn")}>{format.date(`${item.acquiredOn}T12:00:00Z`)}</Row>
          ) : null}
          {item.privateNotes ? <Row label={t("itemForm.privateNotes")}>{item.privateNotes}</Row> : null}
        </dl>
      )}

      <h3 className="mt-5 mb-2 font-semibold">{t("private.documents")}</h3>
      {docs.length === 0 ? (
        <p className="text-sm text-muted">{t("private.noDocs")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-1.5">
              <Icon name="documents" className="text-muted" />
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate py-2 font-medium text-primary-text hover:underline"
              >
                {d.filename}
                <span className="sr-only"> ({t("common.opensNewTab")})</span>
              </a>
              <span className="hidden text-sm text-muted sm:inline">{formatSize(d.sizeBytes)}</span>
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                aria-label={t("private.removeDoc", { name: d.filename })}
                onClick={() => setRemoveId(d.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void onFiles(e.target.files)}
        />
        <Button icon="plus" loading={uploading} onClick={() => input.current?.click()}>
          {t("private.addDoc")}
        </Button>
        <span className="text-sm text-muted">{t("private.docHint")}</span>
      </div>
      <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
        {error}
      </p>

      <ItemFormSheet
        open={editing}
        item={item}
        onClose={() => setEditing(false)}
        onSaved={() => {
          toast(t("common.saved"));
          onChanged();
        }}
      />
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
    </Card>
  );
}
