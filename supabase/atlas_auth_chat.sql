-- Login e-mail/senha sem confirmação + chat da equipe.

create or replace function public.atlas_auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = auth
as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$;

drop trigger if exists atlas_auto_confirm_user on auth.users;
create trigger atlas_auto_confirm_user
  before insert on auth.users
  for each row
  execute function public.atlas_auto_confirm_user();

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_messages_created
  on public.team_messages (created_at desc);

alter table public.team_messages enable row level security;

drop policy if exists "team_messages_select" on public.team_messages;
create policy "team_messages_select"
  on public.team_messages
  for select
  to authenticated
  using (true);

drop policy if exists "team_messages_insert" on public.team_messages;
create policy "team_messages_insert"
  on public.team_messages
  for insert
  to authenticated
  with check (auth.uid() = author_id);

grant select, insert on public.team_messages to authenticated;

alter table public.team_messages replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_messages'
  ) then
    alter publication supabase_realtime add table public.team_messages;
  end if;
end $$;
