-- Meeting times keep the IANA zone they were typed in (NULL for proposals made before this migration).
ALTER TABLE proposals ADD COLUMN meet_tz TEXT;

-- A place that could not be resolved is retried once, on the owner's next view of the conversation.
ALTER TABLE shared_locations ADD COLUMN place_retried INTEGER NOT NULL DEFAULT 0;
ALTER TABLE proposals ADD COLUMN place_retried INTEGER NOT NULL DEFAULT 0;

-- Block list, newest first.
CREATE INDEX blocks_owner_created ON blocks(owner_id, created_at);

-- Service facts that are not tied to an owner, e.g. the last successful Turnstile verification.
CREATE TABLE system_state (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TEXT NOT NULL
);

-- The place cache now lives at most 30 days, with day-precision timestamps.
DELETE FROM geocode_cache WHERE created_at < date('now', '-30 days');
UPDATE geocode_cache SET created_at = substr(created_at, 1, 10);
