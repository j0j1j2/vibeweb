# Git 기반 스냅샷 관리 — Design Spec

**Date:** 2026-03-31
**Scope:** 테넌트 preview 디렉토리의 형상관리 (스냅샷 생성, 태그, 복구)
**Status:** Draft

## Overview

각 테넌트의 `preview/` 디렉토리를 git 저장소로 관리한다. 별도 테이블이나 파일 복사 없이 git commit/tag/checkout으로 스냅샷 생성, 태그 지정, 복구를 처리한다. 콘솔 사이드바에 "스냅샷" 탭을 추가하여 UI에서 조작할 수 있게 한다.

## 설계 원칙

- 스냅샷 = git commit. 별도 저장 메커니즘 불필요.
- 배포 시 자동 스냅샷, 사용자 요청 시 수동 스냅샷 모두 지원.
- 복구는 항상 preview 디렉토리로. 확인 후 별도 배포 필요.
- 태그는 자유 텍스트.

## Backend

### 테넌트 초기화

테넌트 생성 시 (`POST /tenants`) preview 디렉토리에서:

```bash
cd /data/tenants/{id}/preview
git init
git config user.name "vibeweb"
git config user.email "vibeweb@local"
echo "node_modules/" > .gitignore
git add -A
git commit -m "Initial commit"
```

기존 테넌트 마이그레이션: 최초 스냅샷 API 호출 시 git 미초기화 상태이면 자동 init.

### Control-API 엔드포인트

모든 엔드포인트는 `child_process.execFile("git", [...], { cwd: previewDir })` 로 git CLI 직접 호출.

#### `GET /tenants/:id/snapshots`

스냅샷 목록 조회.

```bash
git log --format="%H%n%s%n%aI%n%D" --decorate=short
```

응답:
```json
{
  "snapshots": [
    {
      "hash": "abc1234...",
      "message": "로그인 페이지 추가",
      "created_at": "2026-03-31T14:30:00+09:00",
      "tags": ["v1.0"],
      "is_deploy": false
    }
  ]
}
```

- `is_deploy`: 커밋 메시지가 `deploy-` 접두사이거나 `deploy-*` 태그가 있으면 true.
- 쿼리 파라미터: `?limit=50` (기본 50), `?offset=0`.

#### `POST /tenants/:id/snapshots`

수동 스냅샷 생성.

요청:
```json
{
  "message": "로그인 페이지 추가"
}
```

```bash
cd /data/tenants/{id}/preview
git add -A
git commit -m "{message}" --allow-empty-message
```

변경사항이 없으면 (`nothing to commit`) 409 응답: `{ "error": "No changes to snapshot" }`.

응답 (201):
```json
{
  "snapshot": {
    "hash": "abc1234...",
    "message": "로그인 페이지 추가",
    "created_at": "2026-03-31T14:30:00+09:00",
    "tags": []
  }
}
```

#### `POST /tenants/:id/snapshots/:hash/restore`

해당 커밋 시점으로 preview 디렉토리 복구.

```bash
cd /data/tenants/{id}/preview
git checkout {hash} -- .
```

복구 전 현재 상태를 자동 커밋 (변경사항이 있는 경우):
```bash
git add -A
git commit -m "Auto-save before restore to {hash}" --allow-empty-message
```

그 후 복구 상태도 커밋:
```bash
git add -A
git commit -m "Restored to {hash}"
```

응답:
```json
{
  "message": "Restored to abc1234",
  "snapshot": { "hash": "...", "message": "Restored to abc1234", ... }
}
```

#### `POST /tenants/:id/snapshots/:hash/tag`

태그 추가.

요청:
```json
{
  "tag": "v1.0"
}
```

```bash
git tag "{tag}" {hash}
```

태그 이름 검증: 영문, 숫자, 한글, `-`, `_`, `.`, 공백 허용. 최대 50자. 중복 시 409.

응답 (201):
```json
{
  "tag": "v1.0",
  "hash": "abc1234..."
}
```

#### `DELETE /tenants/:id/snapshots/tags/:tag`

태그 삭제.

```bash
git tag -d "{tag}"
```

응답: `{ "message": "Tag deleted" }`

### 배포 연동

기존 `POST /tenants/:id/deploy` 로직에 추가:

1. 배포 전 preview 상태를 자동 커밋 (변경사항 있으면):
   ```bash
   git add -A && git commit -m "deploy-{YYYYMMDD-HHmmss}"
   ```
2. 자동 태그:
   ```bash
   git tag "deploy-{YYYYMMDD-HHmmss}"
   ```
3. 기존 atomicDeploy 실행 (preview → public/functions 복사)

### 기존 Rollback 전환

`POST /tenants/:id/rollback` 내부 구현을 git 기반으로 변경:
- 가장 최근 `deploy-*` 태그의 이전 `deploy-*` 태그를 찾아서 `git checkout {hash} -- .` 실행.
- 하위 호환 유지: API 인터페이스 변경 없음.

### Git 실행 유틸리티

`packages/control-api/src/git.ts` 에 공통 유틸:

```typescript
async function git(previewDir: string, args: string[]): Promise<string>
async function ensureGitRepo(previewDir: string): Promise<void>
async function autoCommitIfDirty(previewDir: string, message: string): Promise<string | null>
```

## Frontend

### 사이드바 추가

`Sidebar.tsx`의 테넌트 하위 탭에 추가:

| 아이콘 | 라벨 | 라우트 |
|--------|------|--------|
| History | 스냅샷 / Snapshots | `/t/:tenantId/snapshots` |

위치: API와 Settings 사이.

### 라우팅

`App.tsx`에 라우트 추가:
```
/t/:tenantId/snapshots → ChatLayout(SnapshotsPage)
```

### SnapshotsPage

```
┌─────────────────────────────────────────┐
│ 스냅샷                    [📸 스냅샷 찍기] │
├─────────────────────────────────────────┤
│                                         │
│ ● abc1234 - "로그인 페이지 추가"          │
│   3분 전  🏷️ v1.0                       │
│   [복구] [태그 추가]                      │
│                                         │
│ ● def5678 - deploy-20260331-1430        │
│   1시간 전  🚀                           │
│   [복구] [태그 추가]                      │
│                                         │
│ ● 789abcd - "초기 생성"                  │
│   2시간 전                               │
│   [복구] [태그 추가]                      │
│                                         │
│          [더 보기] (50개씩 페이징)         │
└─────────────────────────────────────────┘
```

**구성요소:**
- **스냅샷 찍기 버튼**: 클릭 시 메시지 입력 다이얼로그 → `POST /snapshots`
- **타임라인 목록**: git log 기반, 최신순
  - 커밋 해시 (앞 7자리), 메시지, 상대 시간
  - 배포 스냅샷: 로켓 아이콘으로 구분
  - 태그: 배지로 표시
- **복구 버튼**: 확인 다이얼로그 ("현재 변경사항이 자동 저장된 후 복구됩니다") → `POST /snapshots/:hash/restore`
- **태그 추가**: 인라인 텍스트 입력 → `POST /snapshots/:hash/tag`
- **태그 삭제**: 태그 배지의 X 버튼 → `DELETE /snapshots/tags/:tag`
- **더 보기**: offset 기반 페이징

### API 클라이언트

`packages/console/src/api.ts` 에 추가:

```typescript
getSnapshots(tenantId, limit?, offset?)
createSnapshot(tenantId, message)
restoreSnapshot(tenantId, hash)
addTag(tenantId, hash, tag)
deleteTag(tenantId, tag)
```

### i18n 키

한국어/영어 양쪽에 추가:
- snapshots, createSnapshot, snapshotMessage, restore, restoreConfirm, addTag, deleteTag, noChanges, restoreSuccess, loadMore

## 인프라 변경

### Nginx

`.git` 디렉토리 접근 차단:

```nginx
location ~ /\.git {
    deny all;
    return 404;
}
```

### Preview Server

chokidar watch에서 `.git` 무시:

```typescript
chokidar.watch(previewDir, { ignored: /(^|[\/\\])\.git/ })
```

### Docker

control-api 컨테이너에 git 설치 필요. Dockerfile에 `apk add git` 추가.

### 세션 컨테이너

Claude가 preview 파일을 수정해도 control-api가 git을 관리하므로 충돌 없음. 세션 컨테이너에서는 git 조작하지 않음.

## 제외 사항

- 스냅샷 간 diff 비교 UI (추후 확장 가능)
- 브랜치 관리 (단일 main 브랜치만 사용)
- 스냅샷 자동 정리/GC (git gc는 필요 시 수동)
- db/ 디렉토리의 스냅샷 (SQLite DB는 git 관리 대상에서 제외 — 바이너리 파일)
