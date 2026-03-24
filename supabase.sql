create extension if not exists pgcrypto;

create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 20),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  password_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists guestbook_entries_created_at_idx
  on public.guestbook_entries (created_at desc);

alter table public.guestbook_entries enable row level security;

revoke all on public.guestbook_entries from anon, authenticated;
grant usage on schema public to anon, authenticated;

create or replace view public.guestbook_entries_public as
select
  id,
  name,
  message,
  created_at
from public.guestbook_entries
order by created_at desc;

grant select on public.guestbook_entries_public to anon, authenticated;

create or replace function public.create_guestbook_entry(
  entry_name text,
  entry_message text,
  entry_password text
)
returns table (
  id uuid,
  name text,
  message text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_name text := btrim(entry_name);
  clean_message text := btrim(entry_message);
begin
  if clean_name is null or char_length(clean_name) < 2 or char_length(clean_name) > 20 then
    raise exception 'Name must be between 2 and 20 characters.';
  end if;

  if clean_message is null or char_length(clean_message) < 1 or char_length(clean_message) > 500 then
    raise exception 'Message must be between 1 and 500 characters.';
  end if;

  if entry_password is null or char_length(entry_password) < 4 or char_length(entry_password) > 32 then
    raise exception 'PIN must be between 4 and 32 characters.';
  end if;

  return query
  insert into public.guestbook_entries (name, message, password_hash)
  values (clean_name, clean_message, crypt(entry_password, gen_salt('bf')))
  returning guestbook_entries.id, guestbook_entries.name, guestbook_entries.message, guestbook_entries.created_at;
end;
$$;

create or replace function public.delete_guestbook_entry(
  entry_id uuid,
  entry_password text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if entry_password is null or char_length(entry_password) < 4 then
    return false;
  end if;

  delete from public.guestbook_entries
  where guestbook_entries.id = entry_id
    and guestbook_entries.password_hash = crypt(entry_password, guestbook_entries.password_hash);

  get diagnostics deleted_count = row_count;
  return deleted_count > 0;
end;
$$;

grant execute on function public.create_guestbook_entry(text, text, text) to anon, authenticated;
grant execute on function public.delete_guestbook_entry(uuid, text) to anon, authenticated;
