import { useT } from "../lib/i18n";
import { matchPath, navigate, useLocation } from "../lib/router";
import { type ThemeChoice, useThemeChoice } from "../lib/theme";
import { SegmentedControl } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { IconTile, List, ListRow } from "../ui/List";
import { Sheet, SheetBody } from "../ui/Sheet";

/**
 * Global create actions behind the floating "+" (phone), the rail button (tablet) and the sidebar "New"
 * (desktop). Each action is a URL the pages handle, so it also works from bookmarks and back/forward:
 * `?new=item`, `?quick-card=1` (on an item page: that item), `/tags?new=1`.
 */
export function QuickActionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { pathname } = useLocation();
  const item = matchPath("/items/:id", pathname);
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  return (
    <Sheet open={open} onClose={onClose} title={t("quick.title")} placement="compact">
      <SheetBody>
        <List>
          <ListRow
            onClick={() => go(item ? `/items/${item.id}?quick-card=1` : "/?quick-card=1")}
            leading={
              <IconTile>
                <Icon name="card" className="size-5" />
              </IconTile>
            }
            title={t("quick.card")}
            subtitle={t("quick.cardDesc")}
          />
          <ListRow
            onClick={() => go("/?new=item")}
            leading={
              <IconTile tone="accent">
                <Icon name="plus" className="size-5" />
              </IconTile>
            }
            title={t("inventory.addItem")}
            subtitle={t("quick.addItemDesc")}
          />
          <ListRow
            onClick={() => go("/tags?new=1")}
            leading={
              <IconTile tone="neutral">
                <Icon name="tag" className="size-5" />
              </IconTile>
            }
            title={t("tags.new")}
            subtitle={t("quick.newTagsDesc")}
          />
        </List>
      </SheetBody>
    </Sheet>
  );
}

const THEMES: ThemeChoice[] = ["system", "light", "dark"];

/** Auto / Light / Dark as a segmented control. State is the stored choice (lib/theme). */
export function AppearanceControl({ block }: { block?: boolean }) {
  const t = useT();
  const [choice, setChoice] = useThemeChoice();
  return (
    <SegmentedControl
      label={t("theme.appearance")}
      size="sm"
      block={block}
      value={choice}
      onChange={setChoice}
      options={THEMES.map((c) => ({ value: c, label: t(`theme.${c}` as const) }))}
    />
  );
}

export function AppearanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} title={t("theme.appearance")} placement="center">
      <SheetBody>
        <AppearanceControl block />
      </SheetBody>
    </Sheet>
  );
}
