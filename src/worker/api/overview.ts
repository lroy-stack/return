import { Hono } from "hono";
import type { Overview } from "../../shared/schemas";
import { listActivity } from "../db/activity";
import { listConversationSummaries } from "../db/conversations";
import { listItemSummaries } from "../db/items";
import { listRecoveries } from "../db/recoveries";
import type { AppEnv } from "../env";
import { fileApiPath } from "../lib/urls";

export const overviewApi = new Hono<AppEnv>();

overviewApi.get("/", async (c) => {
  const db = c.env.DB;
  const ownerId = c.get("ownerId");
  const [open, lostItems, openRecoveries, recentActivity] = await Promise.all([
    listConversationSummaries(db, ownerId, { status: "open" }),
    listItemSummaries(db, ownerId, { status: "lost" }, fileApiPath),
    listRecoveries(db, ownerId, { statuses: ["lost", "found", "returning"] }),
    listActivity(db, ownerId, { limit: 20 }).then((page) => page.events),
  ]);
  return c.json<Overview>({
    unreadConversations: open.filter((conversation) => conversation.unread),
    lostItems,
    openRecoveries,
    recentActivity,
  });
});
