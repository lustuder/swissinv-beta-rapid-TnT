-- Public whitelist of each record, computed by the Worker at upload time (no contacts, no timing).
-- Listing a project's inventory then only joins these stored strings (the free plan allows 10 ms CPU).
-- Rows uploaded before this migration have pub = NULL; the Worker computes it from data for them.
ALTER TABLE projects ADD COLUMN pub TEXT;
ALTER TABLE elements ADD COLUMN pub TEXT;
