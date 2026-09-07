create table if not exists public.cec_app_state (
  id integer primary key check (id = 1),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cec_app_state enable row level security;

drop policy if exists "Allow public app state read" on public.cec_app_state;
create policy "Allow public app state read"
  on public.cec_app_state for select
  to anon, authenticated
  using (true);

drop policy if exists "Allow public app state write" on public.cec_app_state;
create policy "Allow public app state write"
  on public.cec_app_state for insert
  to anon, authenticated
  with check (id = 1);

drop policy if exists "Allow public app state update" on public.cec_app_state;
create policy "Allow public app state update"
  on public.cec_app_state for update
  to anon, authenticated
  using (id = 1)
  with check (id = 1);

grant select, insert, update on public.cec_app_state to anon, authenticated;
