-- SwissInv-Beta online sync.
-- Records are stored as the app keeps them (JSON in "data", timing unchanged), plus columns for lookups.
-- Deletes are tombstones (deleted = 1, data NULL), so an older upload can never bring a record back:
-- every write keeps the row with the newest updated_at.
-- Photos and documents are not synced (they stay on the capturing phone).

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT
);

CREATE TABLE IF NOT EXISTS elements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL DEFAULT '',
  label_code TEXT,
  updated_at INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  data TEXT
);
CREATE INDEX IF NOT EXISTS elements_label ON elements (label_code) WHERE deleted = 0;
CREATE INDEX IF NOT EXISTS elements_project ON elements (project_id);
