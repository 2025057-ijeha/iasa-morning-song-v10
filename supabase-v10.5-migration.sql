-- IASA Morning Song v10.5 migration
-- 기존 Supabase 프로젝트에서 SQL Editor에 전체 붙여넣고 Run 하세요.
-- 기존 신청곡/게시글 데이터는 삭제되지 않습니다.

alter table public.requests add column if not exists inspection_status text not null default 'pass';
alter table public.requests add column if not exists inspection_message text not null default '';
alter table public.requests add column if not exists inspection_detail text not null default '';
alter table public.requests add column if not exists inspection_source text not null default '';
alter table public.requests add column if not exists matched_song_title text not null default '';
alter table public.requests add column if not exists matched_song_artist text not null default '';
alter table public.requests add column if not exists inspected_at timestamptz;

-- 기존 신청곡은 과거 자동검사 방식으로 저장된 데이터이므로 그대로 'pass' 상태를 유지합니다.
