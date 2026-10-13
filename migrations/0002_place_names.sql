-- Readable place names for shared coordinates (reverse geocoding, data © OpenStreetMap contributors).
-- Resolved after the row is stored; NULL means "not resolved (yet)" and the UI falls back to coordinates.
ALTER TABLE shared_locations ADD COLUMN place_name TEXT;
ALTER TABLE shared_locations ADD COLUMN place_detail TEXT;
ALTER TABLE shared_locations ADD COLUMN place_address TEXT;

ALTER TABLE proposals ADD COLUMN place_name TEXT;
ALTER TABLE proposals ADD COLUMN place_detail TEXT;
ALTER TABLE proposals ADD COLUMN place_address TEXT;

-- Our side of the Nominatim usage policy: identical points and queries are never requested twice.
-- key: "<lat5>,<lng5>,<lang>" or "q:<normalized query>,<lang>"; owner search budgets use "rl:<owner>:<hour>".
CREATE TABLE geocode_cache (
  key         TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX geocode_cache_created ON geocode_cache(created_at);
