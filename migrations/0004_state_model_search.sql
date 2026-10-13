-- Normalized search text (NFKD, diacritics stripped, lowercase) for accent- and case-insensitive search.
-- SQLite cannot strip diacritics, so the Worker maintains it on create/update; NULL means "not computed yet"
-- (existing rows, restored rows) and is filled lazily, a bounded batch per search request.
ALTER TABLE items ADD COLUMN search_text TEXT;

-- Timeline of a recovery: one row per status reached (lost, found, returning, recovered, closed).
CREATE TABLE recovery_events (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  recovery_id  TEXT NOT NULL REFERENCES recoveries(id) ON DELETE CASCADE,
  status       TEXT NOT NULL CHECK (status IN ('lost', 'found', 'returning', 'recovered', 'closed')),
  note         TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX recovery_events_recovery ON recovery_events(recovery_id, created_at);

-- Backfill what the existing rows can tell: when each recovery started, was recovered and was closed.
INSERT INTO recovery_events (id, owner_id, recovery_id, status, note, created_at)
  SELECT lower(hex(randomblob(16))), owner_id, id, 'lost', NULL, created_at FROM recoveries;
INSERT INTO recovery_events (id, owner_id, recovery_id, status, note, created_at)
  SELECT lower(hex(randomblob(16))), owner_id, id, 'recovered', NULL, recovered_at
    FROM recoveries WHERE recovered_at IS NOT NULL;
INSERT INTO recovery_events (id, owner_id, recovery_id, status, note, created_at)
  SELECT lower(hex(randomblob(16))), owner_id, id, 'closed', NULL, closed_at
    FROM recoveries WHERE closed_at IS NOT NULL;
