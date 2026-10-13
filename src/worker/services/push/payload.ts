/**
 * The only place a push payload is composed. It is content-free by construction: the inputs are
 * an event kind, an opaque conversation id and (optionally) the item name. Message text, places
 * and return plans never reach this module.
 */
import { type PushEventKind, type PushPayload, pushPayloadSchema } from "../../../shared/schemas";
import type { Language } from "../../../shared/settings";
import { appOrigin } from "../../lib/urls";
import type { PushOptions } from "./webpush";

/** Pronoun-free so one wording fits every owner; the item name, when allowed, is appended. */
const BODIES: Record<Language, Record<PushEventKind, string>> = {
  en: {
    new_conversation: "Someone found an item",
    new_message: "New message about an item",
    location_shared: "A location was shared about an item",
    proposal: "New return proposal for an item",
    lost_item_scanned: "Tag on a lost item scanned",
    test: "Test notification",
  },
  de: {
    new_conversation: "Jemand hat einen Gegenstand gefunden",
    new_message: "Neue Nachricht zu einem Gegenstand",
    location_shared: "Zu einem Gegenstand wurde ein Standort geteilt",
    proposal: "Neuer Rückgabevorschlag für einen Gegenstand",
    lost_item_scanned: "Tag an einem verlorenen Gegenstand gescannt",
    test: "Testbenachrichtigung",
  },
  es: {
    new_conversation: "Alguien ha encontrado un objeto",
    new_message: "Nuevo mensaje sobre un objeto",
    location_shared: "Se compartió una ubicación sobre un objeto",
    proposal: "Nueva propuesta de devolución de un objeto",
    lost_item_scanned: "Etiqueta de un objeto perdido escaneada",
    test: "Notificación de prueba",
  },
};

const MAX_ITEM_NAME_CHARS = 60;

export interface PushEventInput {
  kind: PushEventKind;
  conversationId?: string | null;
  /** Only honoured when `showItemName` is true. */
  itemName?: string | null;
}

export function buildPushPayload(
  env: Env,
  event: PushEventInput,
  prefs: { showItemName: boolean; lang: Language },
): PushPayload {
  const conversationId = event.conversationId ?? null;
  const name = prefs.showItemName ? event.itemName?.trim().slice(0, MAX_ITEM_NAME_CHARS) : null;
  const body = BODIES[prefs.lang][event.kind];
  return pushPayloadSchema.parse({
    web_push: 8030,
    notification: {
      title: "RETURN",
      body: name ? `${body}: ${name}` : body,
      navigate: conversationId ? `${appOrigin(env)}/conversations/${conversationId}` : `${appOrigin(env)}/`,
      lang: prefs.lang,
      tag: conversationId ? `c-${conversationId}` : event.kind,
    },
    return: { v: 1, kind: event.kind, conversationId },
  });
}

/** Transport headers per event (ADR 0003, "Sending semantics"). */
export function pushOptionsFor(event: PushEventInput): PushOptions {
  const urgent = event.kind === "new_conversation" || event.kind === "lost_item_scanned";
  const conversationId = event.conversationId;
  return {
    ttl: 86_400,
    urgency: urgent ? "high" : "normal",
    // A newer pending push for the same conversation replaces the older one. Hex keeps the
    // topic inside the base64url alphabet and under 32 characters.
    ...(conversationId ? { topic: `c${conversationId.replace(/[^0-9a-f]/gi, "").slice(0, 16)}` } : {}),
  };
}
