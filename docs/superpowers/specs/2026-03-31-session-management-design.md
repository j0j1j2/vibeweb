# 세션 이어하기 및 관리 — Design Spec

**Date:** 2026-03-31
**Scope:** Claude 채팅 세션의 영속화, 이어하기(--resume), 세션 목록/전환/삭제 UI
**Status:** Draft

## Overview

테넌트별 Claude 대화 세션을 디스크에 영속화하여 WebSocket 재접속 시 이전 대화를 이어갈 수 있게 한다. 채팅 패널 상단에 세션 관리 드롭다운을 추가하여 세션 전환, 새 대화 시작, 세션 삭제를 지원한다.

## 설계 원칙

- 세션 메타데이터는 테넌트 디렉토리에 JSON 파일로 저장. 별도 DB 불필요.
- Claude의 `--resume` 플래그를 활용. bridge.js가 `conversationId`를 전달받아 첫 메시지부터 resume.
- WebSocket 끊김 시 컨테이너는 파괴하되 세션 메타데이터는 유지.
- 세션 제목은 첫 번째 메시지 내용 앞 50자를 자동 사용.

## Backend

### 저장 구조

```
/data/tenants/{tenantId}/sessions/
├── {conversationId}.json    # 세션 메타데이터
├── {conversationId}.json
└── active.json              # 현재 활성 세션 포인터
```

**세션 메타데이터 (`{conversationId}.json`):**
```json
{
  "conversationId": "abc123...",
  "title": "비즈니스 랜딩 페이지 만들어줘",
  "createdAt": "2026-03-31T14:30:00+09:00",
  "lastActivityAt": "2026-03-31T15:00:00+09:00"
}
```

**활성 세션 포인터 (`active.json`):**
```json
{
  "conversationId": "abc123..."
}
```

`active.json`이 없거나 `conversationId`가 null이면 다음 세션은 fresh 시작.

### Bridge 프로토콜 변경

**Agent Service → Bridge (`session.start` 시):**

현재: bridge는 첫 메시지에서 `--resume` 없이 시작, 이후 메시지에서 자체 캡처한 `conversationId`로 resume.

변경: agent-service가 `session.start` 시점에 `conversationId`를 bridge에 전달. bridge는 이 값이 있으면 첫 메시지부터 `--resume` 사용.

```json
// Agent Service → Bridge (WebSocket connect 후 첫 메시지 전)
{ "type": "init", "conversationId": "abc123..." }
```

bridge.js 변경:
- `init` 메시지 수신 시 `conversationId` 설정
- 기존: `if (conversationId) args.push("--resume", conversationId)`
- 변경 없음 — init에서 받은 값으로 동일하게 동작

**Bridge → Agent Service (`session_id` 캡처 시):**

bridge.js가 Claude 출력에서 `session_id`를 캡처하면, 기존 stream 메시지에 이미 포함됨:
```json
{ "type": "stream", "data": { "session_id": "abc123..." } }
```

agent-service는 이 `session_id`를 받아 디스크에 저장. 별도 메시지 타입 불필요.

### Agent Service 변경

**handleSessionStart 변경:**
1. `sessions/active.json` 읽기 → 활성 conversationId 확인
2. conversationId가 있으면 bridge에 `init` 메시지로 전달
3. 없으면 전달하지 않음 (fresh 시작)

**stream 메시지 처리 (proxy에서):**
1. bridge에서 오는 stream 메시지에 `session_id`가 있으면 캡처
2. 세션 메타데이터 파일 생성/업데이트 (`sessions/{conversationId}.json`)
3. `active.json` 업데이트
4. 제목은 첫 번째 사용자 메시지 내용 앞 50자 (이미 메모리에 있음)

**WebSocket 끊김 시:**
- 컨테이너 파괴 (기존 동작 유지)
- 세션 메타데이터는 디스크에 유지 (변경 없음 — 파일 삭제 안 함)

### API 엔드포인트

agent-service에 HTTP 엔드포인트 추가:

#### `GET /sessions/:tenantId`

세션 목록 조회. `sessions/` 디렉토리의 JSON 파일들을 읽어서 반환.

```json
{
  "sessions": [
    { "conversationId": "abc123", "title": "비즈니스 랜딩 페이지 만들어줘", "createdAt": "...", "lastActivityAt": "..." }
  ],
  "activeConversationId": "abc123"
}
```

최신순 정렬 (`lastActivityAt` DESC). 최대 50개.

#### `POST /sessions/:tenantId/switch`

활성 세션 변경.

요청:
```json
{ "conversationId": "abc123" }
```

동작: `active.json`을 `{ "conversationId": "abc123" }`으로 업데이트.
해당 conversationId의 세션 파일이 존재하는지 검증.

#### `POST /sessions/:tenantId/new`

새 대화 시작.

동작: `active.json`을 `{ "conversationId": null }`로 업데이트.
다음 session.start 시 fresh 세션으로 시작됨.

#### `DELETE /sessions/:tenantId/:conversationId`

세션 삭제.

동작: `sessions/{conversationId}.json` 파일 삭제.
삭제 대상이 현재 활성 세션이면 `active.json`도 null로 변경.

## Frontend

### ChatPanel 상단 헤더

기존 "바이브 에디터" 타이틀 영역을 세션 관리 드롭다운으로 교체:

```
┌─────────────────────────────────────┐
│ ▼ 비즈니스 랜딩 페이지 만들어줘  [+ 새 대화] │
├─────────────────────────────────────┤
│ (드롭다운 열렸을 때)                   │
│                                     │
│  ● 비즈니스 랜딩 페이지 만들어줘   3분 전  │
│  ○ 연락처 DB 만들어줘          1시간 전  │
│  ○ API 엔드포인트 추가해줘      어제     │
│                                     │
│  각 항목 hover 시 [🗑] 삭제 버튼      │
└─────────────────────────────────────┘
```

**동작:**
- 헤더 클릭 → 드롭다운 열기/닫기 (세션 목록 GET)
- 세션 항목 클릭 → POST `/sessions/:tenantId/switch` → WebSocket 재연결 (session.end → session.start)
- "새 대화" 클릭 → POST `/sessions/:tenantId/new` → WebSocket 재연결
- 삭제 버튼 → confirm 후 DELETE → 목록 갱신
- 활성 세션: ● (violet), 비활성: ○ (gray)
- 세션 없으면 타이틀은 "바이브 에디터" 유지

### ChatLayout 변경

- `session.ready` 응답에 `conversationId` 포함 (agent-service가 active.json에서 읽어서 전달)
- stream 메시지의 `session_id`를 감지하면 세션 제목 업데이트 (첫 메시지 기준)
- ChatContext에 `activeConversationId`, `sessionTitle` 상태 추가
- 세션 전환 시: `session.end` 전송 → 상태 초기화 → `session.start` 전송

### API 클라이언트 (`api.ts`)

```typescript
getSessions(tenantId)
switchSession(tenantId, conversationId)
newSession(tenantId)
deleteSession(tenantId, conversationId)
```

console nginx 프록시에서 `/agent-api/sessions/` → agent-service로 라우팅 (기존 `/agent-api/` 프록시 규칙으로 이미 커버됨).

### i18n 키

한국어/영어 양쪽에 추가:

```
chat.newConversation: "새 대화" / "New Chat"
chat.sessions: "대화 목록" / "Conversations"
chat.deleteSession: "대화 삭제" / "Delete conversation"
chat.deleteSessionConfirm: "이 대화를 삭제하시겠습니까?" / "Delete this conversation?"
chat.noSessions: "대화 기록이 없습니다" / "No conversations yet"
```

## 제외 사항

- 대화 내용(메시지 히스토리) 저장/복원 — Claude의 `--resume`이 자체적으로 대화 컨텍스트를 복원하므로 메시지를 별도 저장하지 않음
- 세션 이름 수동 편집
- 세션 간 검색
