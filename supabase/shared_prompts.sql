-- Catálogo de prompts públicos do Atlas Studio.
-- Cole no SQL Editor do Supabase depois de criar o projeto.
-- O Atlas entra com e-mail e senha; cada prompt público fica no author_id da conta.

create table if not exists public.shared_prompts (
  id uuid primary key default gen_random_uuid(),
  local_prompt_id text not null,
  name text not null,
  text text not null,
  tab_name text,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null default '',
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists shared_prompts_author_local
  on public.shared_prompts (author_id, local_prompt_id);

create index if not exists shared_prompts_updated
  on public.shared_prompts (updated_at desc);

alter table public.shared_prompts enable row level security;

drop policy if exists "shared_prompts_select" on public.shared_prompts;
create policy "shared_prompts_select"
  on public.shared_prompts
  for select
  using (true);

drop policy if exists "shared_prompts_insert" on public.shared_prompts;
create policy "shared_prompts_insert"
  on public.shared_prompts
  for insert
  with check (auth.uid() = author_id);

drop policy if exists "shared_prompts_update" on public.shared_prompts;
create policy "shared_prompts_update"
  on public.shared_prompts
  for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "shared_prompts_delete" on public.shared_prompts;
create policy "shared_prompts_delete"
  on public.shared_prompts
  for delete
  using (auth.uid() = author_id);
