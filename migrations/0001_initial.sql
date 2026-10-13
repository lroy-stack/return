-- RETURN initial schema.
-- Conventions: ids are opaque random strings; timestamps are ISO-8601 UTC text;
-- every owned row carries owner_id so a future multi-owner setup needs no data migration.

PRAGMA foreign_keys = ON;

CREATE TABLE owners (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at  TEXT NOT NULL
);

-- One validated JSON document per owner (identity, contact, notifications, privacy,
-- public page, tag preferences). Schema lives in src/shared/settings.ts.
CREATE TABLE settings (
  owner_id    TEXT PRIMARY KEY REFERENCES owners(id) ON DELETE CASCADE,
  data        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE items (
  id                    TEXT PRIMARY KEY,
  owner_id              TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  parent_id             TEXT REFERENCES items(id) ON DELETE SET NULL,
  name                  TEXT NOT NULL,
  brand                 TEXT,
  model                 TEXT,
  category              TEXT NOT NULL DEFAULT 'other',
  description           TEXT,
  serial_number         TEXT,
  estimated_value_cents INTEGER,
  currency              TEXT,
  acquired_on           TEXT,
  private_notes         TEXT,
  last_known_location   TEXT,
  last_known_at         TEXT,
  status                TEXT NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'lost')),
  -- Public-facing fields (shown on the finder page).
  public_title          TEXT,
  public_message        TEXT,
  reward_text           TEXT,
  public_photo_id       TEXT,
  -- JSON: per-item overrides of which contact methods are visible. NULL = use settings.
  contact_visibility    TEXT,
  archived_at           TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);
CREATE INDEX items_owner_status ON items(owner_id, archived_at, status);
CREATE INDEX items_parent ON items(parent_id);

-- Photos and documents. Bytes live in the private R2 bucket under r2_key.
CREATE TABLE item_files (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('photo', 'document')),
  r2_key        TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX item_files_item ON item_files(item_id, kind);

CREATE TABLE tags (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id       TEXT REFERENCES items(id) ON DELETE SET NULL,
  -- Public capability token printed in the QR/NFC URL. Never reused.
  token         TEXT NOT NULL UNIQUE,
  -- Human reference such as "001". Not a credential.
  seq           INTEGER NOT NULL,
  label         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  nfc_status    TEXT NOT NULL DEFAULT 'none' CHECK (nfc_status IN ('none', 'pending', 'programmed', 'verified')),
  replaced_by   TEXT REFERENCES tags(id),
  note          TEXT,
  last_seen_at  TEXT,
  revoked_at    TEXT,
  created_at    TEXT NOT NULL,
  UNIQUE (owner_id, seq)
);
CREATE INDEX tags_item ON tags(item_id);

CREATE TABLE trackers (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id             TEXT REFERENCES items(id) ON DELETE SET NULL,
  kind                TEXT NOT NULL DEFAULT 'airtag' CHECK (kind IN ('airtag', 'smarttag', 'tile', 'chipolo', 'other')),
  name                TEXT NOT NULL,
  notes               TEXT,
  last_location_text  TEXT,
  last_location_at    TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX trackers_item ON trackers(item_id);

CREATE TABLE recoveries (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'lost' CHECK (status IN ('lost', 'found', 'returning', 'recovered', 'closed')),
  lost_at       TEXT,
  lost_place    TEXT,
  notes         TEXT,
  recovered_at  TEXT,
  closed_at     TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX recoveries_item ON recoveries(item_id, status);

CREATE TABLE conversations (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  item_id             TEXT REFERENCES items(id) ON DELETE SET NULL,
  tag_id              TEXT REFERENCES tags(id) ON DELETE SET NULL,
  recovery_id         TEXT REFERENCES recoveries(id) ON DELETE SET NULL,
  -- SHA-256 of the finder's private access token. The token itself is never stored.
  finder_token_hash   TEXT NOT NULL UNIQUE,
  finder_name         TEXT,
  finder_email        TEXT,
  finder_lang         TEXT NOT NULL DEFAULT 'en',
  -- HMAC of the finder's IP, only used to enforce blocks and rate limits.
  finder_ip_hmac      TEXT,
  subject             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'blocked')),
  owner_read_at       TEXT,
  finder_read_at      TEXT,
  last_message_at     TEXT NOT NULL,
  last_finder_notified_at TEXT,
  last_owner_notified_at  TEXT,
  closed_at           TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX conversations_owner ON conversations(owner_id, status, last_message_at);
CREATE INDEX conversations_item ON conversations(item_id);
CREATE INDEX conversations_tag_created ON conversations(tag_id, created_at);

CREATE TABLE messages (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender           TEXT NOT NULL CHECK (sender IN ('finder', 'owner', 'system')),
  body             TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX messages_conversation ON messages(conversation_id, created_at);

-- A location deliberately shared inside a conversation (e.g. "where I found it").
CREATE TABLE shared_locations (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  shared_by        TEXT NOT NULL CHECK (shared_by IN ('finder', 'owner')),
  source           TEXT NOT NULL CHECK (source IN ('gps', 'manual')),
  label            TEXT,
  lat              REAL,
  lng              REAL,
  accuracy_m       REAL,
  created_at       TEXT NOT NULL
);
CREATE INDEX shared_locations_conversation ON shared_locations(conversation_id);

-- Return proposals (meeting point, hotel reception, lost & found...).
CREATE TABLE proposals (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  proposed_by      TEXT NOT NULL CHECK (proposed_by IN ('finder', 'owner')),
  kind             TEXT NOT NULL CHECK (kind IN ('meeting_point', 'public_place', 'hotel_reception', 'lost_and_found', 'shipping', 'other')),
  place            TEXT NOT NULL,
  lat              REAL,
  lng              REAL,
  meet_at          TEXT,
  instructions     TEXT,
  status           TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'declined', 'cancelled', 'superseded')),
  responded_at     TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX proposals_conversation ON proposals(conversation_id, created_at);

CREATE TABLE trusted_contacts (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  relationship  TEXT,
  email         TEXT,
  phone         TEXT,
  notify        INTEGER NOT NULL DEFAULT 0,
  show_public   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX trusted_contacts_owner ON trusted_contacts(owner_id);

CREATE TABLE blocks (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  ip_hmac     TEXT NOT NULL,
  reason      TEXT,
  expires_at  TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX blocks_ip ON blocks(ip_hmac);

-- Security and activity history shown in the panel. Pruned by the retention job.
CREATE TABLE activity_events (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,
  item_id          TEXT,
  tag_id           TEXT,
  conversation_id  TEXT,
  country          TEXT,
  data             TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX activity_owner_created ON activity_events(owner_id, created_at);
CREATE INDEX activity_type_created ON activity_events(type, created_at);

CREATE TABLE notifications (
  id               TEXT PRIMARY KEY,
  owner_id         TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  channel          TEXT NOT NULL,
  kind             TEXT NOT NULL,
  recipient        TEXT NOT NULL,
  conversation_id  TEXT,
  status           TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error            TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX notifications_owner_created ON notifications(owner_id, created_at);
