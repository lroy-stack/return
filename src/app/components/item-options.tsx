import type { ItemSummary } from "../../shared/schemas";
import type { T } from "../lib/i18n";
import type { SelectOption } from "../ui/Select";
import { Thumb } from "../ui/Thumb";

/**
 * Combobox options for choosing an item: the thumbnail leads, the category is the second line and the brand/model
 * are searchable. `none` adds the "not assigned" choice (value "") first.
 */
export function itemOptions(
  items: ReadonlyArray<ItemSummary>,
  t: T,
  none?: string,
  extra?: { id: string; name: string },
): SelectOption<string>[] {
  const options: SelectOption<string>[] = items.map((i) => ({
    value: i.id,
    label: i.name,
    description: t(`category.${i.category}` as const),
    keywords: [i.brand, i.model].filter(Boolean).join(" "),
    leading: <Thumb src={i.coverPhotoUrl} category={i.category} size="xs" />,
  }));
  // The assigned item may be archived and missing from the list: keep it selectable so the field shows it.
  if (extra && !items.some((i) => i.id === extra.id)) options.unshift({ value: extra.id, label: extra.name });
  return none === undefined ? options : [{ value: "", label: none }, ...options];
}
