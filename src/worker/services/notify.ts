/**
 * Email notifications. Strictly secondary: every function here swallows delivery errors after
 * logging them, so a broken mail setup never loses a finder's message (messages are stored
 * first and stay readable in the panel).
 *
 * Delivery uses the Cloudflare `send_email` binding. Sending to the owner's verified address
 * works on every plan; sending to finders requires Cloudflare Email Service on Workers Paid,
 * which is why it is opt-in (`notifications.notifyFinders`).
 */
import { type Language, pickLocalized, type Settings } from "../../shared/settings";
import { getSettings } from "../db/settings";
import { newId } from "../lib/ids";
import { nowIso } from "../lib/time";
import { appOrigin } from "../lib/urls";

export type OwnerEventKind =
  | "new_conversation"
  | "new_message"
  | "location_shared"
  | "proposal"
  | "lost_item_scanned";

export interface OwnerEvent {
  kind: OwnerEventKind;
  itemName: string | null;
  conversationId?: string | null;
  /** Short plain-text excerpt (finder message, place name...). */
  preview?: string | null;
}

/** Per-owner ceiling across all notification emails, to blunt spam floods. */
const MAX_EMAILS_PER_HOUR = 30;
/** At most one "new message" email per conversation in this window. */
const MESSAGE_COOLDOWN_MS = 10 * 60_000;

const EVENT_SETTING: Record<OwnerEventKind, keyof Settings["notifications"]["events"]> = {
  new_conversation: "newConversation",
  new_message: "newMessage",
  location_shared: "locationShared",
  proposal: "proposal",
  lost_item_scanned: "lostItemScanned",
};

const SUBJECTS: Record<OwnerEventKind, string> = {
  new_conversation: "Someone found your {item}",
  new_message: "New message about your {item}",
  location_shared: "A location was shared for your {item}",
  proposal: "Return proposal for your {item}",
  lost_item_scanned: "The tag on your lost {item} was scanned",
};

export function emailConfigured(env: Env): boolean {
  return Boolean(env.NOTIFY_FROM && env.EMAIL);
}

export async function notifyOwner(env: Env, ownerId: string, event: OwnerEvent): Promise<void> {
  try {
    const settings = await getSettings(env.DB, ownerId);
    const n = settings.notifications;
    const recipient = n.emailAddress ?? settings.contact.email;
    const kind = `owner.${event.kind}`;
    if (!n.emailEnabled || !recipient || !n.events[EVENT_SETTING[event.kind]]) return;
    if (n.mutedUntil && n.mutedUntil > nowIso()) {
      await logNotification(env, ownerId, kind, recipient, event.conversationId, "skipped", "muted");
      return;
    }
    if (await overHourlyCap(env, ownerId)) {
      await logNotification(env, ownerId, kind, recipient, event.conversationId, "skipped", "hourly_cap");
      return;
    }
    if (
      event.kind === "new_message" &&
      event.conversationId &&
      (await recentlyNotified(env, event.conversationId))
    ) {
      return;
    }

    const item = event.itemName ?? "item";
    const subject = `RETURN: ${SUBJECTS[event.kind].replace("{item}", item)}`;
    const link = event.conversationId
      ? `${appOrigin(env)}/conversations/${event.conversationId}`
      : `${appOrigin(env)}/`;
    const text = [
      subject.replace(/^RETURN: /, ""),
      "",
      event.preview ? `"${event.preview.slice(0, 500)}"` : null,
      "",
      `Open RETURN: ${link}`,
    ]
      .filter((l) => l !== null)
      .join("\n");
    await deliver(env, ownerId, kind, recipient, subject, text, event.conversationId);

    // Trusted contacts are a safety net for the "lost my bag and my phone" case: they hear
    // about first contact and scans of lost items, never about every message.
    if (event.kind === "new_conversation" || event.kind === "lost_item_scanned") {
      const { results } = await env.DB.prepare(
        "SELECT name, email FROM trusted_contacts WHERE owner_id = ? AND notify = 1 AND email IS NOT NULL",
      )
        .bind(ownerId)
        .all<{ name: string; email: string }>();
      for (const contact of results) {
        const ownerName = settings.identity.publicName || "your contact";
        const body = [
          `Hello ${contact.name},`,
          "",
          `You are listed as a trusted contact of ${ownerName} in RETURN.`,
          `${SUBJECTS[event.kind].replace("{item}", item).replace("your", "their")}.`,
          event.preview ? `\nMessage: "${event.preview.slice(0, 500)}"` : "",
          "",
          `${ownerName} has been notified too. If they might be unreachable, please let them know.`,
        ].join("\n");
        await deliver(
          env,
          ownerId,
          "trusted.alert",
          contact.email,
          `RETURN alert for ${ownerName}`,
          body,
          event.conversationId,
        );
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "notifyOwner failed", error: String(err) }));
  }
}

const FINDER_TEXT: Record<
  Language,
  { linkSubject: string; link: string; replySubject: string; reply: string }
> = {
  en: {
    linkSubject: "Your private link to contact the owner",
    link: "Thank you for getting in touch. Keep this private link to read replies and continue the conversation:",
    replySubject: "The owner replied to you",
    reply: "The owner replied. Open the private link from our first email to read it.",
  },
  de: {
    linkSubject: "Ihr privater Link zum Kontakt mit dem Eigentümer",
    link: "Danke, dass Sie sich gemeldet haben. Mit diesem privaten Link lesen Sie Antworten und setzen das Gespräch fort:",
    replySubject: "Der Eigentümer hat Ihnen geantwortet",
    reply:
      "Der Eigentümer hat geantwortet. Öffnen Sie den privaten Link aus unserer ersten E-Mail, um die Antwort zu lesen.",
  },
  es: {
    linkSubject: "Tu enlace privado para contactar con el propietario",
    link: "Gracias por ponerte en contacto. Guarda este enlace privado para leer respuestas y continuar la conversación:",
    replySubject: "El propietario te ha respondido",
    reply: "El propietario ha respondido. Abre el enlace privado de nuestro primer correo para leerlo.",
  },
};

/**
 * Optional email to the finder. The first one carries their private conversation link (we
 * only have the raw token at creation time; afterwards only its hash is stored).
 */
export async function notifyFinder(
  env: Env,
  ownerId: string,
  conversation: { id: string; finderEmail: string | null; lang: Language },
  message: { type: "link"; url: string } | { type: "reply" },
): Promise<void> {
  try {
    if (!conversation.finderEmail) return;
    const settings = await getSettings(env.DB, ownerId);
    if (!settings.notifications.notifyFinders) return;
    if (await overHourlyCap(env, ownerId)) return;
    const t = FINDER_TEXT[conversation.lang];
    const thanks = pickLocalized(settings.messages.thankYouMessage, conversation.lang);
    if (message.type === "link") {
      await deliver(
        env,
        ownerId,
        "finder.link",
        conversation.finderEmail,
        t.linkSubject,
        [t.link, "", message.url, "", thanks].join("\n").trim(),
        conversation.id,
      );
      return;
    }
    const last = await env.DB.prepare("SELECT last_finder_notified_at AS at FROM conversations WHERE id = ?")
      .bind(conversation.id)
      .first<{ at: string | null }>();
    if (last?.at && Date.now() - Date.parse(last.at) < MESSAGE_COOLDOWN_MS) return;
    await deliver(
      env,
      ownerId,
      "finder.reply",
      conversation.finderEmail,
      t.replySubject,
      t.reply,
      conversation.id,
    );
    await env.DB.prepare("UPDATE conversations SET last_finder_notified_at = ? WHERE id = ?")
      .bind(nowIso(), conversation.id)
      .run();
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "notifyFinder failed", error: String(err) }));
  }
}

/** Used by the settings screen. Unlike the others, reports the outcome to the caller. */
export async function sendTestEmail(env: Env, ownerId: string): Promise<{ ok: boolean; error?: string }> {
  const settings = await getSettings(env.DB, ownerId);
  const recipient = settings.notifications.emailAddress ?? settings.contact.email;
  if (!recipient) return { ok: false, error: "no_recipient" };
  const status = await deliver(
    env,
    ownerId,
    "owner.test",
    recipient,
    "RETURN test notification",
    "If you can read this, RETURN can reach you by email.",
    null,
  );
  return status.ok ? { ok: true } : { ok: false, error: status.error };
}

async function deliver(
  env: Env,
  ownerId: string,
  kind: string,
  to: string,
  subject: string,
  text: string,
  conversationId: string | null | undefined,
): Promise<{ ok: boolean; error?: string }> {
  if (!emailConfigured(env)) {
    await logNotification(env, ownerId, kind, to, conversationId, "skipped", "email_not_configured");
    return { ok: false, error: "email_not_configured" };
  }
  try {
    await env.EMAIL.send({ from: { email: env.NOTIFY_FROM, name: "RETURN" }, to, subject, text });
    await logNotification(env, ownerId, kind, to, conversationId, "sent", null);
    return { ok: true };
  } catch (err) {
    const error = String(err).slice(0, 300);
    await logNotification(env, ownerId, kind, to, conversationId, "failed", error);
    return { ok: false, error };
  }
}

async function logNotification(
  env: Env,
  ownerId: string,
  kind: string,
  recipient: string,
  conversationId: string | null | undefined,
  status: "sent" | "failed" | "skipped",
  error: string | null,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO notifications (id, owner_id, channel, kind, recipient, conversation_id, status, error, created_at)
     VALUES (?, ?, 'email', ?, ?, ?, ?, ?, ?)`,
  )
    .bind(newId(), ownerId, kind, recipient, conversationId ?? null, status, error, nowIso())
    .run();
}

async function overHourlyCap(env: Env, ownerId: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM notifications WHERE owner_id = ? AND status = 'sent' AND created_at > ?",
  )
    .bind(ownerId, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) >= MAX_EMAILS_PER_HOUR;
}

async function recentlyNotified(env: Env, conversationId: string): Promise<boolean> {
  const since = new Date(Date.now() - MESSAGE_COOLDOWN_MS).toISOString();
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM notifications
      WHERE conversation_id = ? AND kind IN ('owner.new_message', 'owner.new_conversation') AND status = 'sent' AND created_at > ?`,
  )
    .bind(conversationId, since)
    .first<{ n: number }>();
  return (row?.n ?? 0) > 0;
}
