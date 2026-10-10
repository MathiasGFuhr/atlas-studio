-- Login e-mail/senha sem confirmação + chat da equipe (DM + grupos).

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

-- ---------------------------------------------------------------------------
-- Profiles (diretório de usuários)
-- ---------------------------------------------------------------------------

create table if not exists public.atlas_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  name text not null default '',
  updated_at timestamptz not null default now()
);

create or replace function public.atlas_sync_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.atlas_profiles (id, email, name, updated_at)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1), 'Usuário'),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    name = excluded.name,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists atlas_sync_profile on auth.users;
create trigger atlas_sync_profile
  after insert or update of email, raw_user_meta_data on auth.users
  for each row
  execute function public.atlas_sync_profile();

insert into public.atlas_profiles (id, email, name, updated_at)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(u.email, ''), '@', 1), 'Usuário'),
  now()
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  name = excluded.name,
  updated_at = now();

alter table public.atlas_profiles enable row level security;

drop policy if exists "atlas_profiles_select" on public.atlas_profiles;
create policy "atlas_profiles_select"
  on public.atlas_profiles
  for select
  to authenticated
  using (true);

drop policy if exists "atlas_profiles_upsert_self" on public.atlas_profiles;
create policy "atlas_profiles_upsert_self"
  on public.atlas_profiles
  for all
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

grant select, insert, update on public.atlas_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Rooms + members
-- ---------------------------------------------------------------------------

create table if not exists public.team_rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('dm', 'group')),
  name text,
  created_by uuid not null references auth.users (id) on delete cascade,
  dm_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (kind = 'dm' and dm_key is not null and (name is null or name = ''))
    or (kind = 'group' and dm_key is null and name is not null and length(trim(name)) > 0)
  )
);

create table if not exists public.team_room_members (
  room_id uuid not null references public.team_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  hidden_at timestamptz,
  cleared_before timestamptz,
  primary key (room_id, user_id)
);

alter table public.team_room_members
  add column if not exists hidden_at timestamptz,
  add column if not exists cleared_before timestamptz;

create index if not exists team_room_members_user on public.team_room_members (user_id);
create index if not exists team_rooms_updated on public.team_rooms (updated_at desc);

create or replace function public.is_team_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_team_room_admin(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_room_members m
    where m.room_id = p_room_id
      and m.user_id = auth.uid()
      and m.role = 'admin'
  );
$$;

grant execute on function public.is_team_room_member(uuid) to authenticated;
grant execute on function public.is_team_room_admin(uuid) to authenticated;

alter table public.team_rooms enable row level security;
alter table public.team_room_members enable row level security;

drop policy if exists "team_rooms_select" on public.team_rooms;
create policy "team_rooms_select"
  on public.team_rooms
  for select
  to authenticated
  using (public.is_team_room_member(id));

drop policy if exists "team_rooms_insert" on public.team_rooms;
create policy "team_rooms_insert"
  on public.team_rooms
  for insert
  to authenticated
  with check (auth.uid() = created_by);

drop policy if exists "team_rooms_update" on public.team_rooms;
create policy "team_rooms_update"
  on public.team_rooms
  for update
  to authenticated
  using (public.is_team_room_admin(id))
  with check (public.is_team_room_admin(id));

drop policy if exists "team_room_members_select" on public.team_room_members;
create policy "team_room_members_select"
  on public.team_room_members
  for select
  to authenticated
  using (public.is_team_room_member(room_id));

drop policy if exists "team_room_members_insert" on public.team_room_members;
create policy "team_room_members_insert"
  on public.team_room_members
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or public.is_team_room_admin(room_id)
  );

drop policy if exists "team_room_members_delete" on public.team_room_members;
create policy "team_room_members_delete"
  on public.team_room_members
  for delete
  to authenticated
  using (public.is_team_room_admin(room_id));

drop policy if exists "team_room_members_update_self" on public.team_room_members;
create policy "team_room_members_update_self"
  on public.team_room_members
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.team_rooms to authenticated;
grant select, insert, update, delete on public.team_room_members to authenticated;

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  body text not null,
  created_at timestamptz not null default now(),
  attachment_name text,
  attachment_mime text,
  attachment_url text,
  attachment_kind text
);

alter table public.team_messages
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_url text,
  add column if not exists attachment_kind text,
  add column if not exists room_id uuid references public.team_rooms (id) on delete cascade;

create index if not exists team_messages_created
  on public.team_messages (created_at desc);

create index if not exists team_messages_room_created
  on public.team_messages (room_id, created_at);

alter table public.team_messages
  drop constraint if exists team_messages_attachment_kind_check;

alter table public.team_messages
  add constraint team_messages_attachment_kind_check
  check (
    attachment_kind is null
    or attachment_kind in ('image', 'file')
  );

alter table public.team_messages
  drop constraint if exists team_messages_attachment_consistent;

alter table public.team_messages
  add constraint team_messages_attachment_consistent
  check (
    (
      attachment_url is null
      and attachment_name is null
      and attachment_mime is null
      and attachment_kind is null
    )
    or (
      attachment_url is not null
      and attachment_name is not null
      and attachment_mime is not null
      and attachment_kind is not null
    )
  );

create or replace function public.team_messages_touch_room()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.room_id is not null then
    update public.team_rooms
    set updated_at = coalesce(new.created_at, now())
    where id = new.room_id;

    -- Nova mensagem traz a conversa de volta para quem tinha apagado pra si
    update public.team_room_members
    set hidden_at = null
    where room_id = new.room_id
      and hidden_at is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists team_messages_touch_room on public.team_messages;
create trigger team_messages_touch_room
  after insert on public.team_messages
  for each row
  execute function public.team_messages_touch_room();

alter table public.team_messages enable row level security;

drop policy if exists "team_messages_select" on public.team_messages;
create policy "team_messages_select"
  on public.team_messages
  for select
  to authenticated
  using (
    room_id is not null
    and public.is_team_room_member(room_id)
  );

drop policy if exists "team_messages_insert" on public.team_messages;
create policy "team_messages_insert"
  on public.team_messages
  for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and room_id is not null
    and public.is_team_room_member(room_id)
  );

grant select, insert on public.team_messages to authenticated;

alter table public.team_messages replica identity full;
alter table public.team_rooms replica identity full;
alter table public.team_room_members replica identity full;

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

-- ---------------------------------------------------------------------------
-- RPCs: open DM / create group / add members
-- ---------------------------------------------------------------------------

create or replace function public.team_chat_open_dm(p_other_user_id uuid)
returns public.team_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_key text;
  v_room public.team_rooms;
begin
  if v_me is null then
    raise exception 'Não autenticado.';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'Escolha outra pessoa para conversar.';
  end if;
  if not exists (select 1 from public.atlas_profiles p where p.id = p_other_user_id) then
    raise exception 'Usuário não encontrado.';
  end if;

  v_key := least(v_me::text, p_other_user_id::text)
    || ':'
    || greatest(v_me::text, p_other_user_id::text);

  select * into v_room from public.team_rooms where dm_key = v_key;
  if found then
    insert into public.team_room_members (room_id, user_id, role)
    values
      (v_room.id, v_me, 'member'),
      (v_room.id, p_other_user_id, 'member')
    on conflict do nothing;

    update public.team_room_members
    set hidden_at = null
    where room_id = v_room.id
      and user_id = v_me;

    return v_room;
  end if;

  insert into public.team_rooms (kind, name, created_by, dm_key)
  values ('dm', null, v_me, v_key)
  returning * into v_room;

  insert into public.team_room_members (room_id, user_id, role)
  values
    (v_room.id, v_me, 'member'),
    (v_room.id, p_other_user_id, 'member');

  return v_room;
end;
$$;

create or replace function public.team_chat_hide_for_me(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Não autenticado.';
  end if;
  if p_room_id is null then
    raise exception 'Conversa inválida.';
  end if;
  if not exists (
    select 1
    from public.team_room_members m
    where m.room_id = p_room_id
      and m.user_id = v_me
  ) then
    raise exception 'Você não participa desta conversa.';
  end if;

  update public.team_room_members
  set
    hidden_at = now(),
    cleared_before = now()
  where room_id = p_room_id
    and user_id = v_me;
end;
$$;

create or replace function public.team_chat_create_group(p_name text, p_member_ids uuid[] default '{}')
returns public.team_rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_room public.team_rooms;
  v_name text := trim(coalesce(p_name, ''));
  v_uid uuid;
begin
  if v_me is null then
    raise exception 'Não autenticado.';
  end if;
  if v_name = '' then
    raise exception 'Informe o nome do grupo.';
  end if;

  insert into public.team_rooms (kind, name, created_by, dm_key)
  values ('group', v_name, v_me, null)
  returning * into v_room;

  insert into public.team_room_members (room_id, user_id, role)
  values (v_room.id, v_me, 'admin');

  if p_member_ids is not null then
    foreach v_uid in array p_member_ids loop
      if v_uid is null or v_uid = v_me then
        continue;
      end if;
      if exists (select 1 from public.atlas_profiles p where p.id = v_uid) then
        insert into public.team_room_members (room_id, user_id, role)
        values (v_room.id, v_uid, 'member')
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return v_room;
end;
$$;

create or replace function public.team_chat_add_members(p_room_id uuid, p_member_ids uuid[])
returns setof public.team_room_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kind text;
  v_uid uuid;
begin
  if v_me is null then
    raise exception 'Não autenticado.';
  end if;
  if p_room_id is null then
    raise exception 'Sala inválida.';
  end if;

  select kind into v_kind from public.team_rooms where id = p_room_id;
  if v_kind is null then
    raise exception 'Grupo não encontrado.';
  end if;
  if v_kind <> 'group' then
    raise exception 'Só é possível adicionar pessoas em grupos.';
  end if;
  if not public.is_team_room_admin(p_room_id) then
    raise exception 'Só o admin do grupo pode adicionar pessoas.';
  end if;

  if p_member_ids is null then
    return;
  end if;

  foreach v_uid in array p_member_ids loop
    if v_uid is null then
      continue;
    end if;
    if exists (select 1 from public.atlas_profiles p where p.id = v_uid) then
      insert into public.team_room_members (room_id, user_id, role)
      values (p_room_id, v_uid, 'member')
      on conflict do nothing;
    end if;
  end loop;

  update public.team_rooms set updated_at = now() where id = p_room_id;

  return query
  select *
  from public.team_room_members
  where room_id = p_room_id
    and user_id = any (p_member_ids);
end;
$$;

grant execute on function public.team_chat_open_dm(uuid) to authenticated;
grant execute on function public.team_chat_hide_for_me(uuid) to authenticated;
grant execute on function public.team_chat_create_group(text, uuid[]) to authenticated;
grant execute on function public.team_chat_add_members(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-chat', 'team-chat', true, 20971520, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "team_chat_storage_select" on storage.objects;
create policy "team_chat_storage_select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'team-chat');

drop policy if exists "team_chat_storage_public_select" on storage.objects;
create policy "team_chat_storage_public_select"
  on storage.objects
  for select
  to public
  using (bucket_id = 'team-chat');

drop policy if exists "team_chat_storage_insert" on storage.objects;
create policy "team_chat_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'team-chat'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "team_chat_storage_delete" on storage.objects;
create policy "team_chat_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'team-chat'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
