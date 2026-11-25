-- DRZAVA, GRAD, SELO — Supabase SQL setup
-- Run the entire file in Supabase Dashboard > SQL Editor > New query.
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null,
  player_name text not null,
  pin_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_name_lower on public.profiles (lower(player_name));

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{4}$'),
  admin_id uuid not null references public.profiles(id),
  status text not null default 'lobby' check (status in ('lobby','playing','review','results')),
  letter text,
  category_index int not null default 0 check (category_index between 0 and 6),
  round_ends_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  player_name text not null,
  joined_at timestamptz not null default now(),
  ready boolean not null default false,
  primary key(room_id,player_id)
);
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  player_name text not null,
  category text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  unique(room_id,player_id,category)
);
create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  answer_id uuid not null references public.answers(id) on delete cascade,
  voter_id uuid not null references public.profiles(id),
  valid boolean not null,
  created_at timestamptz not null default now(),
  unique(answer_id,voter_id)
);

-- The 4-digit PIN is only for casual play. It is stored as a bcrypt hash.
-- A profile keeps a stable profile id when claimed from a new anonymous session.
create or replace function public.register_player(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Prijava nije aktivna.'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_name)) > 18 then raise exception 'Ime mora imati 2–18 znakova.'; end if;
  if p_pin !~ '^[0-9]{4}$' then raise exception 'PIN mora imati 4 cifre.'; end if;
  insert into profiles(user_id,player_name,pin_hash)
  values(auth.uid(),trim(p_name),crypt(p_pin,gen_salt('bf')))
  returning * into result;
  return jsonb_build_object('id',result.id,'player_name',result.player_name);
end $$;

create or replace function public.claim_player(p_name text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare result public.profiles;
begin
  if auth.uid() is null then raise exception 'Prijava nije aktivna.'; end if;
  update profiles set user_id=auth.uid()
   where lower(player_name)=lower(trim(p_name)) and pin_hash=crypt(p_pin,pin_hash)
   returning * into result;
  if result.id is null then raise exception 'Pogrešno ime ili PIN.'; end if;
  return jsonb_build_object('id',result.id,'player_name',result.player_name);
end $$;

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.answers enable row level security;
alter table public.votes enable row level security;

create policy "profiles read authenticated" on profiles for select to authenticated using (true);
create policy "profiles update own" on profiles for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

create policy "rooms read authenticated" on rooms for select to authenticated using (true);
create policy "rooms create authenticated" on rooms for insert to authenticated
with check (exists(select 1 from profiles p where p.id=admin_id and p.user_id=auth.uid()));
create policy "rooms admin update" on rooms for update to authenticated
using (exists(select 1 from profiles p where p.id=admin_id and p.user_id=auth.uid()))
with check (exists(select 1 from profiles p where p.id=admin_id and p.user_id=auth.uid()));

create policy "players read authenticated" on room_players for select to authenticated using (true);
create policy "players join own" on room_players for insert to authenticated
with check (exists(select 1 from profiles p where p.id=player_id and p.user_id=auth.uid()));
create policy "players update own or room admin" on room_players for update to authenticated
using (
  exists(select 1 from profiles p where p.id=player_id and p.user_id=auth.uid())
  or exists(select 1 from rooms r join profiles admin_profile on admin_profile.id=r.admin_id
            where r.id=room_id and admin_profile.user_id=auth.uid())
)
with check (
  exists(select 1 from profiles p where p.id=player_id and p.user_id=auth.uid())
  or exists(select 1 from rooms r join profiles admin_profile on admin_profile.id=r.admin_id
            where r.id=room_id and admin_profile.user_id=auth.uid())
);
create policy "players leave own" on room_players for delete to authenticated
using (exists(select 1 from profiles p where p.id=player_id and p.user_id=auth.uid()));

create policy "answers read authenticated" on answers for select to authenticated using (true);
create policy "answers insert own" on answers for insert to authenticated
with check (exists(select 1 from profiles p where p.id=player_id and p.user_id=auth.uid()));
create policy "answers update own" on answers for update to authenticated
using (exists(select 1 from profiles p where p.id=player_id and p.user_id=auth.uid()))
with check (exists(select 1 from profiles p where p.id=player_id and p.user_id=auth.uid()));
create policy "answers delete room admin" on answers for delete to authenticated
using (exists(select 1 from rooms r join profiles p on p.id=r.admin_id where r.id=room_id and p.user_id=auth.uid()));

create policy "votes read authenticated" on votes for select to authenticated using (true);
create policy "votes insert own" on votes for insert to authenticated
with check (exists(select 1 from profiles p where p.id=voter_id and p.user_id=auth.uid()));
create policy "votes update own" on votes for update to authenticated
using (exists(select 1 from profiles p where p.id=voter_id and p.user_id=auth.uid()))
with check (exists(select 1 from profiles p where p.id=voter_id and p.user_id=auth.uid()));

do $$ begin alter publication supabase_realtime add table rooms;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table room_players;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table answers;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table votes;
exception when duplicate_object then null; when undefined_object then null; end $$;
