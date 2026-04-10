-- ============================================================
-- Bevick IMS — PostgreSQL / Supabase Schema
-- Bevick Packaging Machineries · RC: 967373
-- ============================================================

-- ── EXTENSIONS ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── USERS ────────────────────────────────────────────────────
CREATE TABLE users (
  id           TEXT PRIMARY KEY DEFAULT 'U' || extract(epoch from now())::bigint,
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL UNIQUE,
  password     TEXT        NOT NULL,
  role         TEXT        NOT NULL CHECK (role IN ('super_admin', 'inventory', 'sales')),
  branch_id    TEXT        CHECK (branch_id IN ('DUB', 'KUB')),
  initials     TEXT        GENERATED ALWAYS AS (upper(left(name, 2))) STORED,
  phone        TEXT,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── PERMISSIONS ───────────────────────────────────────────────
CREATE TABLE permissions (
  id           SERIAL PRIMARY KEY,
  role         TEXT   NOT NULL UNIQUE,
  pages        TEXT[] NOT NULL DEFAULT '{}'
);

INSERT INTO permissions (role, pages) VALUES
  ('super_admin', ARRAY['dashboard','sales','customers','expenses','inventory','booked','purchase','goods','suppliers','recycle','settings','admin']),
  ('inventory',   ARRAY['dashboard','inventory','booked','purchase','goods','suppliers','settings']),
  ('sales',       ARRAY['dashboard','sales','customers','expenses','booked','settings']);

-- ── SETTINGS ─────────────────────────────────────────────────
CREATE TABLE settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('vat',        '0.075'),
  ('currency',   'NGN'),
  ('biz_name',   'Bevick Packaging Machineries'),
  ('biz_rc',     'RC: 967373'),
  ('biz_phone',  '+234 800 000 0000'),
  ('biz_email',  'info@bevick.com'),
  ('biz_address','Plot 14, Industrial Layout, Abuja'),
  ('low_stock_threshold', '5');

-- ── SUPPLIERS ─────────────────────────────────────────────────
CREATE TABLE suppliers (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  contact      TEXT,
  phone        TEXT,
  email        TEXT,
  address      TEXT,
  category     TEXT,
  status       TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INVENTORY ─────────────────────────────────────────────────
CREATE TABLE inventory_items (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  category     TEXT        NOT NULL,
  qty          INTEGER     NOT NULL DEFAULT 0,
  unit         TEXT        NOT NULL DEFAULT 'Unit',
  price        NUMERIC(15,2) NOT NULL DEFAULT 0,
  min_qty      INTEGER     NOT NULL DEFAULT 5,
  branch       TEXT        CHECK (branch IN ('DUB', 'KUB')),
  supplier     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── CUSTOMERS ─────────────────────────────────────────────────
CREATE TABLE customers (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  email        TEXT,
  phone        TEXT,
  address      TEXT,
  company      TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── SALES ─────────────────────────────────────────────────────
CREATE TABLE sales (
  id           TEXT        PRIMARY KEY,
  customer_id  TEXT        REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  branch       TEXT        CHECK (branch IN ('DUB', 'KUB')),
  subtotal     NUMERIC(15,2) NOT NULL DEFAULT 0,
  vat_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total        NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method TEXT      NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','transfer','pos','credit')),
  status       TEXT        NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','pending','cancelled')),
  notes        TEXT,
  created_by   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sale_items (
  id           SERIAL      PRIMARY KEY,
  sale_id      TEXT        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_id      TEXT        REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name    TEXT        NOT NULL,
  qty          INTEGER     NOT NULL,
  unit_price   NUMERIC(15,2) NOT NULL,
  subtotal     NUMERIC(15,2) NOT NULL
);

-- ── EXPENSES ──────────────────────────────────────────────────
CREATE TABLE expenses (
  id           TEXT        PRIMARY KEY,
  description  TEXT        NOT NULL,
  amount       NUMERIC(15,2) NOT NULL,
  category     TEXT        NOT NULL DEFAULT 'General',
  branch       TEXT        CHECK (branch IN ('DUB', 'KUB')),
  date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  notes        TEXT,
  created_by   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── BOOKINGS ──────────────────────────────────────────────────
CREATE TABLE bookings (
  id           TEXT        PRIMARY KEY,
  customer_id  TEXT        REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT,
  branch       TEXT        CHECK (branch IN ('DUB', 'KUB')),
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','fulfilled','cancelled')),
  total        NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  created_by   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booking_items (
  id           SERIAL      PRIMARY KEY,
  booking_id   TEXT        NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  item_id      TEXT        REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name    TEXT        NOT NULL,
  qty_requested INTEGER    NOT NULL,
  qty_available INTEGER    NOT NULL DEFAULT 0,
  unit_price   NUMERIC(15,2) NOT NULL
);

-- ── PURCHASE LIST ─────────────────────────────────────────────
CREATE TABLE purchase_list (
  id           TEXT        PRIMARY KEY,
  item_id      TEXT        REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name    TEXT        NOT NULL,
  qty_needed   INTEGER     NOT NULL,
  qty_ordered  INTEGER     NOT NULL DEFAULT 0,
  supplier_id  TEXT        REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  unit_price   NUMERIC(15,2),
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ordered','received','cancelled')),
  notes        TEXT,
  created_by   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── GOODS RECEIVED ────────────────────────────────────────────
CREATE TABLE goods_received (
  id           TEXT        PRIMARY KEY,
  supplier_id  TEXT        REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  branch       TEXT        CHECK (branch IN ('DUB', 'KUB')),
  invoice_no   TEXT,
  total_cost   NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes        TEXT,
  received_by  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE grn_items (
  id           SERIAL      PRIMARY KEY,
  grn_id       TEXT        NOT NULL REFERENCES goods_received(id) ON DELETE CASCADE,
  item_id      TEXT        REFERENCES inventory_items(id) ON DELETE SET NULL,
  item_name    TEXT        NOT NULL,
  qty          INTEGER     NOT NULL,
  unit_cost    NUMERIC(15,2) NOT NULL
);

-- ── AUDIT LOG ─────────────────────────────────────────────────
CREATE TABLE audit_log (
  id           SERIAL      PRIMARY KEY,
  action       TEXT        NOT NULL,
  detail       TEXT,
  user_id      TEXT        REFERENCES users(id) ON DELETE SET NULL,
  user_name    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── RECYCLE BIN ───────────────────────────────────────────────
CREATE TABLE recycle_bin (
  id           TEXT        PRIMARY KEY,
  record_type  TEXT        NOT NULL CHECK (record_type IN ('sale','customer','expense','inventory','booking','supplier')),
  record_data  JSONB       NOT NULL,
  deleted_by   TEXT        REFERENCES users(id) ON DELETE SET NULL,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX idx_sales_created_at        ON sales(created_at DESC);
CREATE INDEX idx_sales_branch            ON sales(branch);
CREATE INDEX idx_sale_items_sale_id      ON sale_items(sale_id);
CREATE INDEX idx_inventory_category      ON inventory_items(category);
CREATE INDEX idx_inventory_branch        ON inventory_items(branch);
CREATE INDEX idx_expenses_date           ON expenses(date DESC);
CREATE INDEX idx_bookings_status         ON bookings(status);
CREATE INDEX idx_audit_log_created_at    ON audit_log(created_at DESC);
CREATE INDEX idx_purchase_list_status    ON purchase_list(status);

-- ── ROW LEVEL SECURITY (Supabase) ─────────────────────────────
-- Enable RLS on sensitive tables (configure policies per your auth setup)
ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recycle_bin    ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write (customize per role)
CREATE POLICY "Allow authenticated" ON sales       FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated" ON expenses    FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated" ON audit_log   FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated" ON recycle_bin FOR ALL USING (auth.role() = 'authenticated');
