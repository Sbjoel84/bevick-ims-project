-- ============================================================
-- Bevick IMS — Supabase Schema
-- Run this in your Supabase SQL Editor (once)
-- ============================================================

-- All tables use id (text PK) + data (jsonb) pattern
-- branch column added where needed for potential server-side filtering

create table if not exists app_settings (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb
);

create table if not exists app_users (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists inventory (
  id text primary key,
  branch text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists sales (
  id text primary key,
  branch text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists customers (
  id text primary key,
  branch text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists expenses (
  id text primary key,
  branch text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists bookings (
  id text primary key,
  branch text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists purchase_list (
  id text primary key,
  branch text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists goods_received (
  id text primary key,
  branch text,
  data jsonb not null default '{}'::jsonb
);

create table if not exists suppliers (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists recycle_bin (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists audit_log (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists pending_users (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists delete_requests (
  id text primary key,
  data jsonb not null default '{}'::jsonb
);

create table if not exists permissions (
  role text primary key,
  pages jsonb not null default '[]'::jsonb
);

-- Disable Row Level Security for all tables
-- (the app uses its own user/role system, not Supabase Auth)
alter table app_settings    disable row level security;
alter table app_users       disable row level security;
alter table inventory       disable row level security;
alter table sales           disable row level security;
alter table customers       disable row level security;
alter table expenses        disable row level security;
alter table bookings        disable row level security;
alter table purchase_list   disable row level security;
alter table goods_received  disable row level security;
alter table suppliers       disable row level security;
alter table recycle_bin     disable row level security;
alter table audit_log       disable row level security;
alter table pending_users   disable row level security;
alter table delete_requests disable row level security;
alter table permissions     disable row level security;

-- Seed default settings row (do nothing if already exists)
insert into app_settings (id, data) values (
  'main',
  '{
    "vat": 0.075,
    "thr": 5,
    "currency": "NGN",
    "bizName": "Bevick Packaging Machineries",
    "bizRC": "RC: 967373",
    "bizPhone": "+234 800 000 0000",
    "bizEmail": "info@bevick.com",
    "bizAddress": "Plot 14, Industrial Layout, Abuja",
    "notifySales": true,
    "notifyLowStock": true,
    "notifyExpenses": false
  }'::jsonb
) on conflict (id) do nothing;
