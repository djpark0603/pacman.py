# Orbit Guestbook

GitHub Pages에 바로 올릴 수 있는 정적 방명록입니다. 프론트엔드는 순수 HTML/CSS/JS이고,
데이터 저장은 Supabase REST API와 Supabase Auth를 사용합니다.

## Files

- `index.html`: 방명록 UI
- `styles.css`: 전체 스타일
- `app.js`: Supabase 조회/등록/삭제와 회원가입/로그인 로직
- `pacman-easter-egg.js`: 페이지 하단 이스터에그 팩맨 미니게임
- `supabase.sql`: Supabase SQL Editor에 넣을 테이블, 뷰, 함수 정의
- `pacman.py`: 기존 Python `tkinter` Pac-Man 게임

## Supabase 설정

1. Supabase Dashboard에서 `SQL Editor`를 엽니다.
2. 저장소의 `supabase.sql` 내용을 붙여 넣고 실행합니다.
3. 필요하면 `Table Editor`에서 `guestbook_entries`가 생성됐는지 확인합니다.

이 프로젝트는 직접 테이블에 접근하지 않고 아래 경로만 사용합니다.

- `guestbook_entries_public` 뷰: 공개 목록 조회
- `create_guestbook_entry(...)`: 새 메시지 작성
- `delete_guestbook_entry(...)`: PIN 확인 후 삭제

## 회원 기능

- 회원가입: Supabase Auth 이메일/비밀번호 기반
- 로그인: Access token을 `localStorage`에 저장해 세션 복구
- 작성 연동: 로그인하면 방명록 이름이 계정 표시 이름으로 고정

Supabase Dashboard에서 이메일 회원가입이 비활성화되어 있으면 Auth 기능은 동작하지 않습니다.

## 이스터에그

페이지 맨 아래까지 내리면 팩맨 로고 버튼이 보입니다. 버튼을 누르면 브라우저 안에서 바로 실행되는 미니게임이 열립니다.

## 로컬 실행

정적 파일이라 간단한 서버만 띄우면 됩니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 열면 됩니다.

## GitHub Pages 배포

1. 이 저장소를 GitHub에 push합니다.
2. GitHub 저장소의 `Settings > Pages`로 이동합니다.
3. Source를 현재 브랜치의 `/ (root)`로 선택합니다.
4. 배포가 끝나면 Pages 주소에서 방명록이 바로 동작합니다.

## Pac-Man

기존 게임은 그대로 유지됩니다.

```bash
python pacman.py
```
