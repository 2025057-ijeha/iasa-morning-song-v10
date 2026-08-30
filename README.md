# IASA 기상곡 신청 v10

v10은 v9의 화면과 기능을 유지하면서 **Supabase 영구 데이터베이스 저장**을 추가한 배포용 버전입니다.

## v10 변경점

- 신청곡을 Supabase `requests` 테이블에 영구 저장
- 익명 게시판을 Supabase `posts`, `comments`, `post_likes` 테이블에 영구 저장
- Render가 재시작/재배포되어도 Supabase를 사용하면 데이터가 유지됨
- 관리자 페이지의 날짜 필드 오류 수정 (`requestDate` 통일)
- 관리자 로그인 세션을 서명 쿠키 방식으로 변경하여 서버 재시작 시에도 유효시간 내 로그인 유지 가능
- 로컬 개발에서는 Supabase 환경변수가 없으면 기존 JSON 파일로 자동 실행
- `/api/health`에서 현재 저장 방식 확인 가능

## 1. 로컬에서 바로 실행

```powershell
npm install
npm start
```

Supabase 환경변수가 없으면 `data/requests.json`, `data/posts.json`을 사용하는 테스트 모드입니다.

## 2. Supabase 준비

1. https://supabase.com 에서 프로젝트 생성
2. Supabase Dashboard → SQL Editor
3. 이 폴더의 `supabase-schema.sql` 전체 내용을 붙여넣고 Run
4. Project Settings / API에서 다음 값을 확인
   - Project URL → `SUPABASE_URL`
   - `service_role` secret key → `SUPABASE_SERVICE_ROLE_KEY`

> `SUPABASE_SERVICE_ROLE_KEY`는 절대로 public 폴더, HTML/JS, GitHub 코드에 직접 넣지 마세요. Render의 Environment Variables에만 저장하세요.

## 3. Render 환경변수

Render Web Service → Environment에 아래 값을 추가합니다.

```text
ADMIN_PASSWORD=원하는 관리자 비밀번호
SESSION_SECRET=길고 임의적인 문자열
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role 키
```

기존 관리자 비밀번호를 유지하려면 `ADMIN_PASSWORD=iasadormitory2026`으로 설정할 수 있지만, 실제 공개 운영 전에는 변경을 권장합니다.

## 4. Render 설정

```text
Build Command: npm install
Start Command: npm start
```

배포 로그에 아래와 같이 나오면 Supabase 영구 저장이 적용된 것입니다.

```text
저장 방식: supabase (영구 저장)
```

또는 브라우저에서 아래 주소를 열어 확인할 수 있습니다.

```text
https://내사이트.onrender.com/api/health
```

응답의 `persistent`가 `true`여야 실제 운영용 영구 저장 상태입니다.

## 5. 학생 접속

- 메인: `/`
- 주간 캘린더: `/calendar.html`
- 익명 게시판: `/board.html`
- 관리자: `/admin.html`

학생 기기에는 Node.js, AI 프로그램, API 키를 설치할 필요가 없습니다. AI 검사는 브라우저에서 TensorFlow.js 모델을 불러와 자막 텍스트를 분석합니다.

## 중요

- YouTube 자막을 가져올 수 없는 곡은 자동 승인하지 않습니다.
- 브라우저 AI 모델은 특히 영어 욕설/유해 표현 탐지에 강하며, 한국어는 서버의 키워드 필터가 추가로 검사합니다.
- Supabase Free 플랜의 정책/한도는 변경될 수 있으므로 실제 운영 전 현재 요금제와 한도를 확인하세요.

## v10.1 관리자 게시판 관리 추가

관리자 페이지에서 `기상곡 신청 관리`와 `게시판 관리` 탭을 전환할 수 있습니다. 게시판 관리에서는 전체 게시글/댓글/좋아요 수를 확인하고, 게시글 제목·내용 수정, 게시글 전체 삭제, 개별 댓글 삭제가 가능합니다. 기존 Supabase 테이블 구조를 그대로 사용하므로 `supabase-schema.sql`을 다시 실행할 필요는 없습니다.

## v10.2 게시판/관리자 UI 개선
- 익명 게시판 최신순/인기순 정렬
- 게시글 목록에서 제목·댓글 수·좋아요 수·작성일 확인
- 목록에서 글 선택 시 상세 보기 모달에서 내용·댓글 확인/작성/좋아요/삭제
- 관리자 화면 전체를 동일한 화이트·그린 디자인 언어로 통일하고 회색/점선 박스 제거


## v10.3 변경사항
- 관리자 신청곡 화면에 Excel(.xlsx) 내보내기 추가
- 참고 Google Sheet 형식: 요일 / 연번 / 학번 / 이름 / 노래 제목 / 아티스트 / YouTube 링크
- 관리자 기본 비밀번호: `wpgktkfkdgo0226`
- Render의 ADMIN_PASSWORD 환경변수도 반드시 같은 값으로 변경


## v10.4 변경사항
- YouTube 자막/가사 수집 기능 완전 제거
- TensorFlow.js Toxicity 브라우저 AI 제거
- 곡 제목 + 가수명으로 Apple/iTunes 공개 음원 카탈로그 검색
- 한국 곡은 KR 카탈로그를 우선 검색하고, 해외 곡은 US 카탈로그까지 함께 검색
- Explicit 표시 곡 자동 차단
- Cleaned 표시 곡은 원곡에 Explicit 버전이 있을 수 있어 자동 승인하지 않음
- 곡 제목/가수/YouTube 영상 제목 자체의 욕설·선정적 키워드도 검사
- 입력한 곡과 YouTube 영상이 크게 다르면 자동 차단/재확인
- 별도 AI API 키나 유료 서비스 필요 없음

### 주의
이 검사는 가사 자체를 읽지 않습니다. 공개 음원 서비스의 Explicit 등급과 메타데이터를 이용하므로
등급이 누락된 곡까지 100% 판별할 수는 없습니다. 학교 방송용 최종 확인은 관리자가 병행하는 것이 안전합니다.
