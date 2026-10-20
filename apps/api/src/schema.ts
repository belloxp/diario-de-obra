// Esquema do banco. Idempotente: pode ser executado várias vezes.
export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  active        boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  contract_number text,
  location        text,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photo_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category_id   uuid REFERENCES photo_categories(id) ON DELETE SET NULL,
  r2_key        text NOT NULL UNIQUE,
  original_name text,
  mime_type     text,
  size_bytes    bigint,
  taken_at      timestamptz NOT NULL DEFAULT now(),
  note          text NOT NULL DEFAULT '',
  created_by    uuid NOT NULL REFERENCES users(id),
  updated_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS photos_project_taken_idx ON photos (project_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS photos_category_idx ON photos (category_id);

CREATE TABLE IF NOT EXISTS diary_entries (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  text       text NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diary_project_date_idx ON diary_entries (project_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS rain_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  record_date date NOT NULL,
  mm          numeric(6,1) NOT NULL CHECK (mm >= 0),
  note        text NOT NULL DEFAULT '',
  created_by  uuid NOT NULL REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, record_date)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id          bigserial PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity_type text,
  entity_id   text,
  summary     text NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_user_idx ON activity_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_created_idx ON activity_log (created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number           int NOT NULL,
  title            text NOT NULL DEFAULT '',
  contract_number  text,
  period_from      date NOT NULL,
  period_to        date NOT NULL,
  show_state       boolean NOT NULL DEFAULT true,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_signature', 'signed')),
  zapsign_token    text,
  zapsign_sign_url text,
  signed_at        timestamptz,
  created_by       uuid NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, number)
);
CREATE INDEX IF NOT EXISTS reports_project_idx ON reports (project_id, number DESC);
`;

export const DEFAULT_CATEGORIES = [
  'Geral',
  'Engenharia Interna e de Campo',
  'Seção Técnica',
  'Administrativo',
  'Topografia (Campo)',
  'Meio Ambiente (Campo/Interno)',
  'Equipamentos',
];
