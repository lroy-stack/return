import "./item-art.css";
import { createElement, type ReactElement, useEffect, useId, useMemo, useState } from "react";
import type { ItemCategory } from "../../shared/schemas";
import { categoryIcon } from "../lib/categories";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { ArtNode, ITEM_ART } from "./item-art.generated";

type ArtSet = typeof ITEM_ART;

/**
 * The illustration data (~5 KB gz for all categories) is its own chunk: requested the first time an
 * illustration renders, shared by every instance afterwards. On failure (offline before the chunk was cached)
 * the next mount retries, and this mount falls back to the category line icon.
 */
let loaded: ArtSet | null = null;
let pending: Promise<ArtSet> | null = null;
export function preloadItemArt(): Promise<ArtSet> {
  pending ??= import("./item-art.generated").then(
    (m) => {
      loaded = m.ITEM_ART;
      return loaded;
    },
    (error: unknown) => {
      pending = null;
      throw error;
    },
  );
  return pending;
}

/** Instance-scoped ids so gradients and <use> references never collide (or resolve into a hidden copy). */
function renderNode([tag, props, children]: ArtNode, uid: string, key: number): ReactElement {
  const p: Record<string, string | number> = { key };
  for (const [k, v] of Object.entries(props)) {
    if (k === "id") p[k] = `${uid}-${v}`;
    else if (k === "href" && v.startsWith("#")) p[k] = `#${uid}-${v.slice(1)}`;
    else p[k] = v.replace(/url\(#([\w-]+)\)/g, `url(#${uid}-$1)`);
  }
  return createElement(tag, p, ...children.map((c, i) => renderNode(c, uid, i)));
}

/**
 * Dimensional illustration of an item category (3/4 view, top-left light, contact shadow). Tint it with
 * `--illo-body` (and the other `--illo-*` properties in item-art.css). Decorative by default; pass `label`
 * when no adjacent text names the item (then it is `role="img"`).
 */
export function ItemArt({
  category,
  label,
  className,
}: {
  category: ItemCategory;
  label?: string;
  className?: string;
}) {
  const [art, setArt] = useState<ArtSet | null>(loaded);
  const [failed, setFailed] = useState(false);
  const uid = useId().replace(/[^\w-]/g, "");

  useEffect(() => {
    if (art) return;
    let live = true;
    preloadItemArt().then(
      (a) => live && setArt(a),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [art]);

  const nodes = useMemo(
    () => (art ? art[category].map((n, i) => renderNode(n, uid, i)) : null),
    [art, category, uid],
  );

  const cls = failed
    ? cx("flex items-center justify-center text-primary-text", className)
    : cx("item-art", className);
  const content = failed ? (
    <Icon name={categoryIcon(category)} className="size-1/2" strokeWidth={1.5} />
  ) : (
    nodes
  );
  if (failed) {
    return label ? (
      <span role="img" aria-label={label} className={cls}>
        {content}
      </span>
    ) : (
      <span aria-hidden="true" className={cls}>
        {content}
      </span>
    );
  }
  return label ? (
    <svg viewBox="0 0 96 96" focusable="false" role="img" aria-label={label} className={cls}>
      {content}
    </svg>
  ) : (
    <svg viewBox="0 0 96 96" focusable="false" aria-hidden="true" className={cls}>
      {content}
    </svg>
  );
}
