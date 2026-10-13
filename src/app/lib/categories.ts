import type { ItemCategory } from "../../shared/schemas";
import type { IconName } from "../ui/Icon";

export function categoryIcon(category: ItemCategory): IconName {
  return category === "other" ? "box" : category;
}
