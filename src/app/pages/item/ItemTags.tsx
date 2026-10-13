import { useState } from "react";
import type { ItemDetail, Tag } from "../../../shared/schemas";
import { NfcBadge, TagSheet, TagStatusBadge } from "../../components/TagSheet";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { Button, ButtonLink } from "../../ui/Button";
import { Section } from "../../ui/Card";
import { ConfirmDialog } from "../../ui/ConfirmDialog";
import { Icon } from "../../ui/Icon";
import { IconTile, List, ListRow } from "../../ui/List";
import { errorMessage } from "../../ui/States";
import { useToast } from "../../ui/Toast";

export function ItemTags({
  detail,
  onChanged,
  className,
}: {
  detail: ItemDetail;
  onChanged: () => void;
  className?: string;
}) {
  const t = useT();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tags: Tag[] = detail.tags;
  const active = tags.filter((x) => x.status === "active");
  const open = tags.find((x) => x.id === openId) ?? null;

  const add = async () => {
    setAdding(true);
    setError(null);
    try {
      await api.post("/tags", { itemId: detail.item.id, count: 1 });
      toast(t("itemTags.added"));
      onChanged();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setAdding(false);
    }
  };

  return (
    <Section
      id="sec-tags"
      className={className}
      title={t("itemTags.title")}
      actions={
        <>
          {active.length > 0 ? (
            <ButtonLink
              size="sm"
              variant="ghost"
              icon="print"
              to={`/tags/print?ids=${active.map((x) => x.id).join(",")}`}
            >
              {t("itemTags.print")}
            </ButtonLink>
          ) : null}
          <Button size="sm" variant="tinted" icon="plus" loading={adding} onClick={() => setConfirmAdd(true)}>
            {t("itemTags.add")}
          </Button>
        </>
      }
    >
      {tags.length === 0 ? (
        <p className="rounded-card bg-sunken px-4 py-5 text-subhead text-muted">{t("itemTags.empty")}</p>
      ) : (
        <List label={t("itemTags.title")}>
          {tags.map((tag) => (
            <ListRow
              key={tag.id}
              onClick={() => setOpenId(tag.id)}
              className={tag.status === "revoked" ? "opacity-70" : undefined}
              leading={
                <IconTile tone={tag.status === "revoked" ? "neutral" : "primary"}>
                  <Icon name="qr" className="size-5" />
                </IconTile>
              }
              title={tag.label}
              subtitle={tag.note ?? undefined}
              trailing={
                <>
                  <TagStatusBadge tag={tag} />
                  <NfcBadge status={tag.nfcStatus} />
                </>
              }
            />
          ))}
        </List>
      )}
      <p role="alert" className="text-subhead font-medium text-danger empty:hidden">
        {error}
      </p>
      <ConfirmDialog
        open={confirmAdd}
        title={t("itemTags.addTitle")}
        message={t("itemTags.addBody", { n: active.length })}
        confirmLabel={t("itemTags.add")}
        tone="primary"
        onClose={() => setConfirmAdd(false)}
        onConfirm={add}
      />
      <TagSheet tag={open} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </Section>
  );
}
