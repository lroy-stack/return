-- Web Push / Expo push subscriptions (ADR 0003). One row per device.
-- The table already models finder subscriptions (audience = 'finder' + conversation_id) so that
-- phase can ship without a breaking migration; the owner API only reads and writes audience 'owner'.
CREATE TABLE push_subscriptions (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  audience         TEXT NOT NULL CHECK (audience IN ('owner', 'finder')),
  conversation_id  TEXT REFERENCES conversations(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL CHECK (channel IN ('webpush', 'expo')),
  -- Web Push endpoint URL or Expo push token. Identifies a device to its push service: a secret.
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT,
  auth             TEXT,
  label            TEXT,
  failures         INTEGER NOT NULL DEFAULT 0,
  first_failure_at TEXT,
  last_failure_at  TEXT,
  last_success_at  TEXT,
  created_at       TEXT NOT NULL,
  CHECK ((audience = 'finder') = (conversation_id IS NOT NULL)),
  CHECK (channel <> 'webpush' OR (p256dh IS NOT NULL AND auth IS NOT NULL))
);
CREATE INDEX push_subscriptions_owner ON push_subscriptions(owner_id, audience);
CREATE INDEX push_subscriptions_conversation ON push_subscriptions(conversation_id);
