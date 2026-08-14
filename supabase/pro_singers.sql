-- Pro Singers — applications, roster, and performance requests.
-- Run in Supabase SQL Editor (shared project). Required before API deploy.

begin;

create table if not exists public.singer_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null default '',
  instagram text not null default '',
  languages text not null default '',
  genres text not null default '',
  demo_url text not null default '',
  bio text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  admin_notes text not null default '',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint singer_applications_user_unique unique (user_id)
);

create index if not exists singer_applications_status_created_idx
  on public.singer_applications (status, created_at desc);

create table if not exists public.pro_singers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  application_id uuid references public.singer_applications (id) on delete set null,
  display_name text not null default '',
  instagram text not null default '',
  languages text not null default '',
  genres text not null default '',
  bio text not null default '',
  active boolean not null default true,
  featured boolean not null default false,
  sort_order int not null default 0,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists pro_singers_active_sort_idx
  on public.pro_singers (active, featured desc, sort_order asc, approved_at desc);

create table if not exists public.pro_singer_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  request_type text not null
    check (request_type in ('re_vocal', 'occasion', 'premium')),
  package_tier text not null,
  price_usd numeric(10, 2) not null,
  song_id text not null default '',
  song_title text not null default '',
  song_art_url text not null default '',
  occasion text not null default '',
  brief text not null default '',
  singer_notes text not null default '',
  singer_id uuid references auth.users (id) on delete set null,
  specific_singer_addon boolean not null default false,
  status text not null default 'submitted'
    check (status in ('submitted', 'confirmed', 'in_progress', 'review', 'delivered', 'closed', 'cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'refunded')),
  contact_email text not null default '',
  contact_instagram text not null default '',
  admin_notes text not null default '',
  delivered_song_id text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pro_singer_requests_requester_created_idx
  on public.pro_singer_requests (requester_id, created_at desc);

create index if not exists pro_singer_requests_status_created_idx
  on public.pro_singer_requests (status, created_at desc);

alter table public.singer_applications enable row level security;
alter table public.pro_singers enable row level security;
alter table public.pro_singer_requests enable row level security;

-- Reads/writes go through Vercel service role; no direct client policies for v1.

commit;
