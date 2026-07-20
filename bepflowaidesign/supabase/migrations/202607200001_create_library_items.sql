create table if not exists public.library_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('recipe', 'restaurant')),
  item_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, item_id)
);

create index if not exists library_items_user_id_idx
  on public.library_items (user_id);

alter table public.library_items enable row level security;

grant select, insert, update, delete on public.library_items to authenticated;
grant usage, select on sequence public.library_items_id_seq to authenticated;

create policy "Users can read their own library"
  on public.library_items for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert their own library"
  on public.library_items for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own library"
  on public.library_items for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own library"
  on public.library_items for delete to authenticated
  using ((select auth.uid()) = user_id);
