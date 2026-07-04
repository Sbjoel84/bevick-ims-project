-- ============================================================
-- Bevick IMS — Inventory & Sales Transaction Ledgers
-- Run once in Supabase SQL Editor. Additive only — does not
-- touch any table in supabase-schema.sql.
--
-- These tables deliberately use real typed columns (not the
-- id text + data jsonb pattern used everywhere else in this
-- app) because they must support fast filtered/sorted queries
-- at 1,000,000+ rows. Both are append-only: RLS is enabled
-- with INSERT + SELECT policies only — no UPDATE/DELETE policy
-- exists, so no client holding only the anon key can ever
-- modify or erase a row, regardless of what the UI allows.
-- ============================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fast ILIKE search at scale

-- ============================================================
-- INVENTORY LEDGER
-- ============================================================

create sequence if not exists inventory_transactions_seq;

create table if not exists inventory_transactions (
  id                 uuid primary key default gen_random_uuid(),
  transaction_number text unique not null,
  transaction_type   text not null check (transaction_type in
                        ('Stock In','Stock Out','Adjustment','Transfer',
                         'Sale','Booking','Delete','Restore','Update')),
  product_id         text,
  product_name       text,
  category           text,
  source             text,
  branch             text,
  quantity_before    numeric not null default 0,
  quantity_changed   numeric not null default 0,
  quantity_after     numeric not null default 0,
  performed_by       text,
  performed_by_id    text,
  user_role          text,
  reference_number   text,
  description        text,
  remarks            text,
  status             text not null default 'Completed',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function set_inventory_transaction_number()
returns trigger language plpgsql as $$
begin
  new.transaction_number := 'TRX-' || lpad(nextval('inventory_transactions_seq')::text, 6, '0');
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_inventory_transaction_number on inventory_transactions;
create trigger trg_inventory_transaction_number
  before insert on inventory_transactions
  for each row execute function set_inventory_transaction_number();

create index if not exists idx_invtx_created_at        on inventory_transactions (created_at desc);
create index if not exists idx_invtx_branch_created     on inventory_transactions (branch, created_at desc);
create index if not exists idx_invtx_product_id         on inventory_transactions (product_id);
create index if not exists idx_invtx_category           on inventory_transactions (category);
create index if not exists idx_invtx_type               on inventory_transactions (transaction_type);
create index if not exists idx_invtx_performed_by_id    on inventory_transactions (performed_by_id);
create index if not exists idx_invtx_reference_number   on inventory_transactions (reference_number);
create index if not exists idx_invtx_product_name_trgm  on inventory_transactions using gin (product_name gin_trgm_ops);
create index if not exists idx_invtx_performed_by_trgm  on inventory_transactions using gin (performed_by gin_trgm_ops);
create index if not exists idx_invtx_txn_number_trgm    on inventory_transactions using gin (transaction_number gin_trgm_ops);

alter table inventory_transactions enable row level security;
drop policy if exists invtx_insert on inventory_transactions;
drop policy if exists invtx_select on inventory_transactions;
create policy invtx_insert on inventory_transactions for insert with check (true);
create policy invtx_select on inventory_transactions for select using (true);
-- No UPDATE/DELETE policy => denied unconditionally. Ledger is append-only.

-- ============================================================
-- SALES LEDGER (parallel structure, financial fields)
-- ============================================================

create sequence if not exists sales_transactions_seq;

create table if not exists sales_transactions (
  id                 uuid primary key default gen_random_uuid(),
  transaction_number text unique not null,
  transaction_type   text not null check (transaction_type in
                        ('Sale Created','Sale Updated','Sale Deleted',
                         'Payment Recorded','Booking Delivered','Sale Restored')),
  sale_id            text,
  customer_name      text,
  branch             text,
  amount_before      numeric not null default 0,
  amount_changed     numeric not null default 0,
  amount_after       numeric not null default 0,
  payment_method     text,
  items_count        integer,
  performed_by       text,
  performed_by_id    text,
  user_role          text,
  reference_number   text,
  description        text,
  remarks            text,
  status             text not null default 'Completed',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create or replace function set_sales_transaction_number()
returns trigger language plpgsql as $$
begin
  new.transaction_number := 'STX-' || lpad(nextval('sales_transactions_seq')::text, 6, '0');
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sales_transaction_number on sales_transactions;
create trigger trg_sales_transaction_number
  before insert on sales_transactions
  for each row execute function set_sales_transaction_number();

create index if not exists idx_salestx_created_at       on sales_transactions (created_at desc);
create index if not exists idx_salestx_branch_created    on sales_transactions (branch, created_at desc);
create index if not exists idx_salestx_sale_id           on sales_transactions (sale_id);
create index if not exists idx_salestx_type              on sales_transactions (transaction_type);
create index if not exists idx_salestx_performed_by_id   on sales_transactions (performed_by_id);
create index if not exists idx_salestx_reference_number  on sales_transactions (reference_number);
create index if not exists idx_salestx_customer_trgm     on sales_transactions using gin (customer_name gin_trgm_ops);
create index if not exists idx_salestx_performed_by_trgm on sales_transactions using gin (performed_by gin_trgm_ops);
create index if not exists idx_salestx_txn_number_trgm   on sales_transactions using gin (transaction_number gin_trgm_ops);

alter table sales_transactions enable row level security;
drop policy if exists salestx_insert on sales_transactions;
drop policy if exists salestx_select on sales_transactions;
create policy salestx_insert on sales_transactions for insert with check (true);
create policy salestx_select on sales_transactions for select using (true);

-- ============================================================
-- RPC: aggregate summary functions (avoid full-table pulls)
-- ============================================================

create or replace function inventory_txn_dashboard_counts(p_branch text default null)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'today_count',       count(*) filter (where created_at >= date_trunc('day', now())),
    'week_count',        count(*) filter (where created_at >= date_trunc('week', now())),
    'month_count',       count(*) filter (where created_at >= date_trunc('month', now())),
    'month_stock_in',    coalesce(sum(quantity_changed) filter (where quantity_changed > 0 and created_at >= date_trunc('month', now())), 0),
    'month_stock_out',   coalesce(abs(sum(quantity_changed) filter (where quantity_changed < 0 and created_at >= date_trunc('month', now()))), 0),
    'month_adjustments', count(*) filter (where transaction_type = 'Adjustment' and created_at >= date_trunc('month', now())),
    'month_transfers',   count(*) filter (where transaction_type = 'Transfer' and created_at >= date_trunc('month', now()))
  )
  from inventory_transactions
  where p_branch is null or branch = p_branch;
$$;

create or replace function inventory_txn_report_summary(p_start timestamptz, p_end timestamptz, p_branch text default null)
returns jsonb language sql stable as $$
  with scoped as (
    select * from inventory_transactions
    where created_at >= p_start and created_at <= p_end
      and (p_branch is null or branch = p_branch)
  ),
  top_product as (
    select product_name, count(*) c from scoped group by product_name order by c desc limit 1
  ),
  top_officer as (
    select performed_by, count(*) c from scoped group by performed_by order by c desc limit 1
  ),
  branch_summary as (
    select jsonb_agg(jsonb_build_object(
      'branch', branch,
      'count', cnt,
      'stock_in', stock_in,
      'stock_out', stock_out
    )) as arr
    from (
      select branch,
             count(*) cnt,
             coalesce(sum(quantity_changed) filter (where quantity_changed > 0), 0) stock_in,
             coalesce(abs(sum(quantity_changed) filter (where quantity_changed < 0)), 0) stock_out
      from scoped group by branch
    ) b
  )
  select jsonb_build_object(
    'total_transactions',  (select count(*) from scoped),
    'total_stock_in',      (select coalesce(sum(quantity_changed) filter (where quantity_changed > 0), 0) from scoped),
    'total_stock_out',     (select coalesce(abs(sum(quantity_changed) filter (where quantity_changed < 0)), 0) from scoped),
    'net_movement',        (select coalesce(sum(quantity_changed), 0) from scoped),
    'most_active_product', (select product_name from top_product),
    'most_active_officer', (select performed_by from top_officer),
    'branch_summary',      (select arr from branch_summary)
  );
$$;

create or replace function sales_txn_dashboard_counts(p_branch text default null)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'today_count',       count(*) filter (where created_at >= date_trunc('day', now())),
    'week_count',        count(*) filter (where created_at >= date_trunc('week', now())),
    'month_count',       count(*) filter (where created_at >= date_trunc('month', now())),
    'month_sales_value', coalesce(sum(amount_changed) filter (where transaction_type = 'Sale Created' and created_at >= date_trunc('month', now())), 0),
    'month_payments',    coalesce(sum(amount_changed) filter (where transaction_type = 'Payment Recorded' and created_at >= date_trunc('month', now())), 0),
    'month_deletions',   count(*) filter (where transaction_type = 'Sale Deleted' and created_at >= date_trunc('month', now()))
  )
  from sales_transactions
  where p_branch is null or branch = p_branch;
$$;

create or replace function sales_txn_report_summary(p_start timestamptz, p_end timestamptz, p_branch text default null)
returns jsonb language sql stable as $$
  with scoped as (
    select * from sales_transactions
    where created_at >= p_start and created_at <= p_end
      and (p_branch is null or branch = p_branch)
  ),
  top_officer as (select performed_by, count(*) c from scoped group by performed_by order by c desc limit 1),
  top_customer as (select customer_name, count(*) c from scoped group by customer_name order by c desc limit 1)
  select jsonb_build_object(
    'total_transactions',   (select count(*) from scoped),
    'total_sales_value',    (select coalesce(sum(amount_changed) filter (where transaction_type = 'Sale Created'), 0) from scoped),
    'total_payments',       (select coalesce(sum(amount_changed) filter (where transaction_type = 'Payment Recorded'), 0) from scoped),
    'most_active_officer',  (select performed_by from top_officer),
    'most_active_customer', (select customer_name from top_customer)
  );
$$;
