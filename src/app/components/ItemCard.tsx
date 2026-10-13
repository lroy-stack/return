import type { ItemSummary } from "../../shared/schemas";
import { useT } from "../lib/i18n";
import { Link } from "../lib/router";
import { StatusPill } from "../ui/Badge";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { Thumb } from "../ui/Thumb";

/** Category fallback that fills its container (kept for existing call sites; renders `Thumb`). */
export function CategoryTile({
  category,
  className = "",
}: {
  category: ItemSummary["category"];
  className?: string;
}) {
  return <Thumb category={category} size="fill" className={className} />;
}

/** Photo-forward item tile for the inventory grid. Lost items get a solid pill on the photo and a lost ring. */
export function ItemCard({ item }: { item: ItemSummary }) {
  const t = useT();
  const sub = [item.brand, item.model].filter(Boolean).join(" · ");
  const lost = item.status === "lost";
  return (
    <li className="animate-in">
      <Link
        to={`/items/${item.id}`}
        className={cx(
          "group pressable flex h-full flex-col overflow-hidden rounded-card bg-raised shadow-card ring-1 transition-shadow duration-200 hover:shadow-float",
          lost ? "ring-2 ring-lost" : "ring-line/70",
          item.archivedAt && "opacity-75",
        )}
      >
        <div className="relative aspect-4/3 w-full overflow-hidden bg-sunken">
          {item.coverPhotoUrl ? (
            <img
              src={item.coverPhotoUrl}
              alt=""
              loading="lazy"
              decoding="async"
              width={640}
              height={480}
              className="size-full object-cover transition-transform duration-500 ease-standard group-hover:scale-[1.03]"
            />
          ) : (
            <Thumb category={item.category} size="fill" />
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
            {lost ? (
              <StatusPill tone="lost" solid pulse>
                {t("item.lost")}
              </StatusPill>
            ) : null}
            {item.archivedAt ? <StatusPill solid>{t("item.archived")}</StatusPill> : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-0.5 p-3.5">
          <h3 className="line-clamp-2 text-body leading-snug font-semibold">{item.name}</h3>
          <p className="truncate text-footnote text-muted">
            {sub || t(`category.${item.category}` as const)}
          </p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-footnote text-muted">
            <span className="inline-flex items-center gap-1" title={t("item.tagCount", { n: item.tagCount })}>
              <Icon name="tag" className="size-4" />
              <span aria-hidden="true">{item.tagCount}</span>
              <span className="sr-only">{t("item.tagCount", { n: item.tagCount })}</span>
            </span>
            {item.openConversationCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-semibold text-lost">
                <Icon name="inbox" className="size-4" />
                {t("item.openConversations", { n: item.openConversationCount })}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
