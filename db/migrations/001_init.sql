-- Corujinha: esquema inicial (Postgres / Supabase).
-- Valores monetários em centavos (bigint). Nada de número completo de cartão.
-- RLS: cada pessoa só enxerga dados do próprio "household" (o casal).

create table household (
  id uuid primary key default gen_random_uuid(),
  split_rule jsonb not null default '{"kind":"equal"}',
  created_at timestamptz not null default now()
);

create table member (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references household (id) on delete cascade,
  display_name text not null,
  monthly_income_cents bigint check (monthly_income_cents > 0)
);

-- Garante no banco o limite de 2 pessoas por casal.
create function enforce_two_members() returns trigger language plpgsql as $$
begin
  if (select count(*) from member where household_id = new.household_id) >= 2 then
    raise exception 'household já tem 2 pessoas';
  end if;
  return new;
end $$;
create trigger member_limit before insert on member
  for each row execute function enforce_two_members();

create table card (
  id text primary key,                       -- id do agregador
  household_id uuid not null references household (id) on delete cascade,
  owner_id uuid not null references member (user_id) on delete cascade,
  institution text not null,
  display_name text not null,
  last4 text check (last4 ~ '^\d{4}$')
);

create table bill (
  id text primary key,
  household_id uuid not null references household (id) on delete cascade,
  card_id text not null references card (id) on delete cascade,
  reference_month text not null check (reference_month ~ '^\d{4}-\d{2}$'),
  due_date date not null,
  total_cents bigint not null,
  minimum_payment_cents bigint
);
create index bill_month on bill (household_id, reference_month);

create table card_transaction (
  id text primary key,
  household_id uuid not null references household (id) on delete cascade,
  bill_id text not null references bill (id) on delete cascade,
  card_id text not null references card (id) on delete cascade,
  occurred_on date not null,
  description text not null,
  amount_cents bigint not null,
  category text,
  installment_number int,
  installment_total int
);

-- Classificação feita pelo casal (dividir / não dividir / regra específica).
create table transaction_allocation (
  transaction_id text primary key references card_transaction (id) on delete cascade,
  household_id uuid not null references household (id) on delete cascade,
  allocation jsonb not null,
  updated_by uuid not null references member (user_id),
  updated_at timestamptz not null default now()
);

create table recurring_bill (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references household (id) on delete cascade,
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  paid_by uuid not null references member (user_id),
  allocation jsonb not null,
  due_day int not null check (due_day between 1 and 31),
  active boolean not null default true
);

-- Trilha de auditoria: quem conectou/revogou bancos e quando.
create table audit_log (
  id bigserial primary key,
  household_id uuid not null references household (id) on delete cascade,
  user_id uuid not null,
  action text not null,                       -- ex.: connect, sync, revoke
  detail jsonb,
  at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
create function my_household() returns uuid language sql stable security definer as $$
  select household_id from member where user_id = auth.uid()
$$;

do $$
declare t text;
begin
  foreach t in array array['card','bill','card_transaction','transaction_allocation','recurring_bill','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy %I on %I using (household_id = my_household()) with check (household_id = my_household())',
      t || '_household', t);
  end loop;
end $$;

alter table household enable row level security;
create policy household_self on household using (id = my_household());

alter table member enable row level security;
create policy member_same_household on member for select using (household_id = my_household());
-- Cada um só altera o próprio cadastro (ex.: renda).
create policy member_self_update on member for update using (user_id = auth.uid());
