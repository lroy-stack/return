import { useState } from "react";
import type { ItemDetail, Tag } from "../../../shared/schemas";
import { NfcBadge, TagSheet, TagStatusBadge } from "../../components/TagSheet";
import { api } from "../../lib/api";
import { useT } from "../../lib/i18n";
import { Button, ButtonLink } from "../../ui/Button";
import { Card, SectionHeading } from "../../ui/Card";
import { Icon } from "../../ui/Icon";
import { errorMessage } from "../../ui/States";
import { useToast } from "../../ui/Toast";

export function ItemTags({ detail, onChanged }: { detail: ItemDetail; onChanged: () => void }) {
  const t = useT();
  const toast = useToast();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
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
    <Card aria-labelledby="sec-tags">
      <SectionHeading
        id="sec-tags"
        title={t("itemTags.title")}
        description={t("itemTags.desc")}
        actions={
          <>
            {active.length > 0 ? (
              <ButtonLink size="sm" icon="print" to={`/tags/print?ids=${active.map((x) => x.id).join(",")}`}>
                {t("itemTags.print")}
              </ButtonLink>
            ) : null}
            <Button size="sm" icon="plus" loading={adding} onClick={add}>
              {t("itemTags.add")}
            </Button>
          </>
        }
      />
      {tags.length === 0 ? (
        <p className="text-muted">{t("itemTags.empty")}</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {tags.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                onClick={() => setOpenId(tag.id)}
                className={`flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-sunken ${tag.status === "revoked" ? "opacity-70" : ""}`}
                aria-label={t("itemTags.manage", { label: tag.label })}
              >
                <Icon name="qr" className="text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{tag.label}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <TagStatusBadge tag={tag} />
                    <NfcBadge status={tag.nfcStatus} />
                  </span>
                </span>
                <Icon name="chevron" className="text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <p role="alert" className="mt-2 text-sm font-medium text-danger empty:hidden">
        {error}
      </p>
      <TagSheet tag={open} onClose={() => setOpenId(null)} onChanged={onChanged} />
    </Card>
  );
}
