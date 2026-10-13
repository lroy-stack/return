import { useRef, useState } from "react";
import type { FileMeta, ItemDetail } from "../../../shared/schemas";
import { CategoryTile } from "../../components/ItemCard";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { resizePhoto } from "../../lib/image";
import { Button } from "../../ui/Button";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { errorMessage } from "../../ui/States";
import { useToast } from "../../ui/Toast";

export async function uploadFile(itemId: string, kind: "photo" | "document", file: File): Promise<FileMeta> {
  const form = new FormData();
  form.set("itemId", itemId);
  form.set("kind", kind);
  form.set("file", file, file.name);
  return api.upload<FileMeta>("/files", form);
}

export function Gallery({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const { item } = detail;
  const photos = detail.files.filter((f) => f.kind === "photo");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = photos.find((p) => p.id === selectedId) ?? photos[0] ?? null;
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const isPublic = selected !== null && item.publicPhotoId === selected.id;

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setError(null);
    setProgress({ done: 0, total: list.length });
    let last: FileMeta | null = null;
    try {
      for (const [i, file] of list.entries()) {
        const small = await resizePhoto(file);
        last = await uploadFile(item.id, "photo", small);
        setProgress({ done: i + 1, total: list.length });
      }
      if (last) setSelectedId(last.id);
      toast(t("gallery.uploaded", { n: list.length }));
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
      onChanged();
    }
  };

  const setPublic = async (fileId: string | null) => {
    setError(null);
    try {
      await api.put(`/items/${item.id}/public-photo`, { fileId });
      toast(fileId ? t("gallery.publicSet") : t("gallery.publicCleared"));
      onChanged();
    } catch (e) {
      setError(errorMessage(e, t));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-4/3 w-full overflow-hidden rounded-card border border-line bg-sunken">
        {selected ? (
          <img
            src={selected.url}
            alt={t("gallery.photoAlt", { name: item.name })}
            className="size-full object-contain"
          />
        ) : (
          <CategoryTile category={item.category} className="size-full" />
        )}
        {isPublic ? (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-fg">
            <Icon name="star" className="size-3.5" />
            {t("gallery.publicBadge")}
          </span>
        ) : null}
      </div>

      {photos.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t("gallery.thumbs")}>
          {photos.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                aria-pressed={p.id === selected?.id}
                aria-label={t("gallery.showPhoto", { n: i + 1 })}
                className={`block size-16 overflow-hidden rounded-xl border-2 ${p.id === selected?.id ? "border-primary" : "border-transparent"}`}
              >
                <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          ref={input}
          id="photo-input"
          aria-label={t("gallery.add")}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => void onFiles(e.target.files)}
          tabIndex={-1}
        />
        <Button icon="camera" loading={progress !== null} onClick={() => input.current?.click()}>
          {progress
            ? t("gallery.uploading", { done: progress.done, total: progress.total })
            : t("gallery.add")}
        </Button>
        {selected ? (
          <>
            <Button
              icon="star"
              onClick={() => void setPublic(isPublic ? null : selected.id)}
              aria-pressed={isPublic}
            >
              {isPublic ? t("gallery.unsetPublic") : t("gallery.setPublic")}
            </Button>
            <Button icon="trash" variant="ghost" onClick={() => setDeleting(true)}>
              {t("gallery.delete")}
            </Button>
          </>
        ) : null}
      </div>
      <p className="flex gap-2 text-sm text-muted">
        <Icon name="info" className="mt-0.5 size-4" />
        <span>
          {t("gallery.exifNote")} {t("gallery.publicNote")}
        </span>
      </p>
      <p role="alert" className="text-sm font-medium text-danger empty:hidden">
        {error}
      </p>

      <ConfirmDialog
        open={deleting}
        title={t("gallery.deleteTitle")}
        message={t("gallery.deleteBody")}
        confirmLabel={t("common.delete")}
        onClose={() => setDeleting(false)}
        onConfirm={async () => {
          if (!selected) return;
          await api.delete(`/files/${selected.id}`);
          setSelectedId(null);
          onChanged();
        }}
      />
    </div>
  );
}
