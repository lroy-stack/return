-- Coordinates behind an item's free-text "last known location" (filled by "Use my location").
-- Owner-only: never read by the finder pages. NULL when the location was typed by hand.
ALTER TABLE items ADD COLUMN last_known_lat REAL;
ALTER TABLE items ADD COLUMN last_known_lng REAL;
ALTER TABLE items ADD COLUMN last_known_accuracy_m REAL;
