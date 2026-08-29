-- IASA Morning Song v10 - Supabase schema
-- Supabase Dashboard > SQL Editor에서 이 파일 전체를 붙여넣고 Run 하세요.

create table if not exists public.requests (
  id uuid primary key,
  request_date date not null,
  slot integer not null check (slot between 1 and 7),
  student_number text not null,
  student_name text not null,
  song_title text not null,
  artist_name text not null,
  url text not null,
  edit_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  admin_edited boolean not null default false,
  constraint requests_date_slot_unique unique (request_date, slot)
);

create table if not exists public.posts (
  id uuid primary key,
  title text not null,
  content text not null,
  delete_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  voter_id text not null,
  created_at timestamptz not null default now(),
  primary key (post_id, voter_id)
);

create index if not exists requests_request_date_idx on public.requests(request_date);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists post_likes_post_id_idx on public.post_likes(post_id);

-- 브라우저가 DB에 직접 접속하지 않고 Node 서버만 Service Role로 접속합니다.
-- 그래서 공개 정책 없이 RLS를 켜 두어 클라이언트 직접 접근을 차단합니다.
alter table public.requests enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
