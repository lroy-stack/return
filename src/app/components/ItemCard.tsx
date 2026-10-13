import type { ItemSummary } from "../../shared/schemas";
import { categoryIcon } from "../lib/categories";
import { useT } from "../lib/i18n";
import { Link } from "../lib/router";
import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";

export function CategoryTile({
  category,
  className = "",
}: {
  category: ItemSummary["category"];
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-center bg-primary-tint text-primary-text ${className}`}>
      <Icon name={categoryIcon(category)} className="size-1/4 min-h-8 min-w-8" strokeWidth={1.25} />
    </div>
  );
}

export function ItemCard({ item }: { item: ItemSummary }) {
  const t = useT();
  const sub = [item.brand, item.model].filter(Boolean).join(" · ");
  const lost = item.status === "lost";
  return (
    <li className="animate-in">
      <Link
        to={`/items/${item.id}`}
        className={`group flex h-full flex-col overflow-hidden rounded-card border bg-raised shadow-card transition-shadow duration-150 hover:shadow-float ${
          lost ? "border-lost" : "border-line"
        } ${item.archivedAt ? "opacity-75" : ""}`}
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
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <CategoryTile category={item.category} className="size-full" />
          )}
          <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
            {lost ? (
              <Badge tone="lost" icon="alert">
                {t("item.lost")}
              </Badge>
            ) : null}
            {item.archivedAt ? <Badge>{t("item.archived")}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-1 p-3.5">
          <h3 className="truncate text-base leading-snug font-semibold">{item.name}</h3>
          <p className="truncate text-sm text-muted">{sub || t(`category.${item.category}` as const)}</p>
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1" title={t("item.tagCount", { n: item.tagCount })}>
              <Icon name="tag" className="size-4" />
              <span aria-hidden="true">{item.tagCount}</span>
              <span className="sr-only">{t("item.tagCount", { n: item.tagCount })}</span>
            </span>
            {item.openConversationCount > 0 ? (
              <span className="inline-flex items-center gap-1 font-medium text-lost">
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
