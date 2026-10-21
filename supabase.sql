-- Pegar y correr completo en Supabase → SQL Editor.

create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  list        text not null check (list in ('barbara', 'carlos', 'home')),
  name        text not null,
  link        text,
  photo_url   text,
  priority    smallint not null default 3 check (priority between 1 and 4),
  notes       text,
  extras      jsonb not null default '[]'::jsonb,
  room        text,
  size        text,
  color       text,
  price       numeric,
  price_tier  smallint check (price_tier between 1 and 4),
  received    boolean not null default false,
  received_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Solo usuarios con sesión iniciada (ustedes dos) pueden leer y escribir.
grant select, insert, update, delete on public.items to authenticated;
revoke all on public.items from anon;
alter table public.items enable row level security;

drop policy if exists "signed in users manage items" on public.items;
create policy "signed in users manage items" on public.items
  for all to authenticated using (true) with check (true);

-- Carpeta para las fotos.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

drop policy if exists "signed in users upload photos" on storage.objects;
create policy "signed in users upload photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'photos');

-- Cambios posteriores (seguros de correr más de una vez).
alter table public.items add column if not exists price numeric;
alter table public.items add column if not exists price_tier smallint check (price_tier between 1 and 4);
alter table public.items add column if not exists extras jsonb not null default '[]'::jsonb;
