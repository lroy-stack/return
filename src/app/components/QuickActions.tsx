import { useState } from "react";
import { useI18n } from "../lib/i18n";
import { matchPath, navigate, useLocation } from "../lib/router";
import { applyTheme, readTheme, type ThemeChoice } from "../lib/theme";
import { SegmentedControl } from "../ui/Field";
import { Icon } from "../ui/Icon";
import { IconTile, List, ListRow } from "../ui/List";
import { Sheet, SheetBody } from "../ui/Sheet";
import { shellString } from "./shell-strings";

/**
 * Global create actions behind the floating "+" (phone), the rail button (tablet) and the sidebar "New"
 * (desktop). Each action is a URL the pages handle, so it also works from bookmarks and back/forward:
 * `?new=item`, `?quick-card=1` (on an item page: that item), `/tags?new=1`.
 */
export function QuickActionsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, t } = useI18n();
  const { pathname } = useLocation();
  const item = matchPath("/items/:id", pathname);
  const go = (to: string) => {
    onClose();
    navigate(to);
  };
  return (
    <Sheet open={open} onClose={onClose} title={shellString(lang, "quickTitle")} placement="compact">
      <SheetBody>
        <List>
          <ListRow
            onClick={() => go(item ? `/items/${item.id}?quick-card=1` : "/?quick-card=1")}
            leading={
              <IconTile>
                <Icon name="card" className="size-5" />
              </IconTile>
            }
            title={shellString(lang, "quickCard")}
            subtitle={shellString(lang, "quickCardDesc")}
          />
          <ListRow
            onClick={() => go("/?new=item")}
            leading={
              <IconTile tone="accent">
                <Icon name="plus" className="size-5" />
              </IconTile>
            }
            title={t("inventory.addItem")}
            subtitle={shellString(lang, "quickAddItemDesc")}
          />
          <ListRow
            onClick={() => go("/tags?new=1")}
            leading={
              <IconTile tone="neutral">
                <Icon name="tag" className="size-5" />
              </IconTile>
            }
            title={t("tags.new")}
            subtitle={shellString(lang, "quickNewTagsDesc")}
          />
        </List>
      </SheetBody>
    </Sheet>
  );
}

const THEMES: ThemeChoice[] = ["system", "light", "dark"];

/** Auto / Light / Dark as a segmented control. State is the stored choice (lib/theme). */
export function AppearanceControl({ block }: { block?: boolean }) {
  const { lang, t } = useI18n();
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <SegmentedControl
      label={shellString(lang, "appearance")}
      size="sm"
      block={block}
      value={choice}
      onChange={(next) => {
        applyTheme(next);
        setChoice(next);
      }}
      options={THEMES.map((c) => ({ value: c, label: t(`theme.${c}` as const) }))}
    />
  );
}

export function AppearanceSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useI18n();
  return (
    <Sheet open={open} onClose={onClose} title={shellString(lang, "appearance")} placement="center">
      <SheetBody>
        <AppearanceControl block />
      </SheetBody>
    </Sheet>
  );
}
