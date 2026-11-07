-- Clareza: diário pessoal de ideias por tarefa.
-- Aplicada em Supabase em 2026-11-07 (migration 20261107155012).
-- Notas são particulares do autor, mesmo em tarefas compartilhadas.

create table public.task_ideas (
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.personal_tasks(id) on delete cascade,
 author_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null default 'idea' check (kind in ('idea','alternative','decision','next_step')),
 body text not null check (char_length(btrim(body)) between 1 and 6000),
 is_pinned boolean not null default false,
 created_at timestamptz not null default now()
);
create index task_ideas_author_task_created_idx
 on public.task_ideas(author_id,task_id,created_at desc);
create unique index task_ideas_one_pin_per_author_task_idx
 on public.task_ideas(task_id,author_id) where is_pinned;
alter table public.task_ideas enable row level security;
revoke all on table public.task_ideas from public, anon, authenticated;
grant select, insert on table public.task_ideas to authenticated;
grant update (is_pinned) on table public.task_ideas to authenticated;
create policy task_ideas_select_own_visible_task on public.task_ideas
 for select to authenticated
 using (
  author_id = (select auth.uid())
  and exists (select 1 from public.personal_tasks t
              where t.id = task_id and t.deleted_at is null)
 );
create policy task_ideas_insert_own_visible_task on public.task_ideas
 for insert to authenticated
 with check (
  author_id = (select auth.uid())
  and exists (select 1 from public.personal_tasks t
              where t.id = task_id and t.deleted_at is null)
 );
create policy task_ideas_update_own_visible_task on public.task_ideas
 for update to authenticated
 using (
  author_id = (select auth.uid())
  and exists (select 1 from public.personal_tasks t
              where t.id = task_id and t.deleted_at is null)
 )
 with check (
  author_id = (select auth.uid())
  and exists (select 1 from public.personal_tasks t
              where t.id = task_id and t.deleted_at is null)
 );
