# K3s Migration — Design Spec

**Date:** 2026-04-01
**Scope:** Docker Compose → K3s 전면 이관 (정적 서비스, 함수 실행, 세션 관리 포함)
**Status:** Draft

## Overview

Docker Compose 기반 VibeWeb 플랫폼을 K3s(k3d)로 이관한다. 모든 서비스를 K8s Deployment으로 전환하고, dockerode 기반 동적 컨테이너 생성을 K8s API 기반 Pod/Job 생성으로 교체한다. DinD 사용하지 않음.

## 설계 원칙

- 소스 코드 변경 최소화. `session.ts`와 `container.ts`만 재작성.
- 도메인을 ConfigMap으로 빼서 설정 가능하게 (`vibeweb.localhost` → 추후 커스텀 도메인).
- k3d 내장 레지스트리로 로컬 이미지 관리.
- local-path-provisioner로 PVC 자동 프로비저닝.

## 로컬 개발 환경

### k3d 클러스터 생성

```bash
k3d registry create vibeweb-registry --port 5000
k3d cluster create vibeweb \
  --registry-use k3d-vibeweb-registry:5000 \
  --port "80:80@loadbalancer" \
  --port "8080:8080@loadbalancer" \
  --agents 0
```

### 이미지 빌드 & 푸시

```bash
# 빌드 후 로컬 레지스트리에 push
docker build -t localhost:5000/vibeweb-control-api:latest -f packages/control-api/Dockerfile .
docker push localhost:5000/vibeweb-control-api:latest
# 각 서비스 동일
```

## K8s Manifests 구조

```
k8s/
├── namespace.yaml              # vibeweb 네임스페이스
├── storage.yaml                # PVC (tenant-data)
├── configmap.yaml              # 공유 환경변수 (BASE_DOMAIN 등)
├── secret.yaml                 # TOKEN_ENCRYPTION_KEY, ADMIN_API_KEY 등
├── rbac.yaml                   # ServiceAccount + Role (Pod 생성 권한)
├── ingress.yaml                # Traefik Ingress + Middleware (ForwardAuth)
├── nginx.yaml                  # Deployment + Service
├── console.yaml                # Deployment + Service
├── control-api.yaml            # Deployment + Service
├── preview-server.yaml         # Deployment + Service
├── function-runner.yaml        # Deployment + Service
├── agent-service.yaml          # Deployment + Service
└── networkpolicy.yaml          # 함수 Pod 외부 트래픽 차단
```

## Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: vibeweb
```

모든 리소스는 `vibeweb` 네임스페이스에 배치.

## Storage

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: tenant-data
  namespace: vibeweb
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: local-path
  resources:
    requests:
      storage: 10Gi
```

단일 PVC `tenant-data`를 모든 서비스에서 subPath로 공유.
- control-api: `mountPath: /data, subPath: ""` (전체)
- nginx: `mountPath: /data/tenants, subPath: tenants`
- preview-server: `mountPath: /data, subPath: ""`
- agent-service: `mountPath: /data, subPath: ""`
- function-runner: `mountPath: /data, subPath: ""`

동적 Pod(세션, 함수)도 같은 PVC를 subPath로 마운트.

## ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vibeweb-config
  namespace: vibeweb
data:
  DATA_DIR: "/data"
  BASE_DOMAIN: "vibeweb.localhost"
  PVC_NAME: "tenant-data"
  NAMESPACE: "vibeweb"
```

`BASE_DOMAIN`은 Ingress 규칙 생성과 ForwardAuth에서 참조. 도메인 변경 시 이 값만 수정.

## Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: vibeweb-secrets
  namespace: vibeweb
type: Opaque
stringData:
  ADMIN_API_KEY: "<admin-key>"
  TOKEN_ENCRYPTION_KEY: "<64-char-hex>"
  ANTHROPIC_API_KEY: "<optional-fallback>"
```

## RBAC

agent-service와 function-runner가 K8s API로 Pod을 생성/삭제하므로 권한 필요:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: vibeweb-pod-manager
  namespace: vibeweb
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-manager
  namespace: vibeweb
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log", "pods/status"]
    verbs: ["create", "get", "list", "watch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-manager-binding
  namespace: vibeweb
subjects:
  - kind: ServiceAccount
    name: vibeweb-pod-manager
roleRef:
  kind: Role
  name: pod-manager
  apiGroup: rbac.authorization.k8s.io
```

agent-service, function-runner Deployment에 `serviceAccountName: vibeweb-pod-manager` 지정.

## Ingress

K3s 내장 Traefik의 IngressRoute CRD 사용. 기존 `dynamic.yml` 규칙 변환:

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: tenant-auth
  namespace: vibeweb
spec:
  forwardAuth:
    address: "http://control-api.vibeweb.svc.cluster.local:1919/auth/validate"
    authResponseHeaders:
      - "X-Tenant-Id"
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: vibeweb-routes
  namespace: vibeweb
spec:
  entryPoints: [web]
  routes:
    # Console — console.{BASE_DOMAIN}
    - match: "Host(`console.vibeweb.localhost`)"
      kind: Rule
      services:
        - name: console
          port: 80
      priority: 200

    # Control API — {BASE_DOMAIN} (bare domain)
    - match: "Host(`vibeweb.localhost`)"
      kind: Rule
      services:
        - name: control-api
          port: 1919
      priority: 200

    # Function Runner — *.{BASE_DOMAIN}/api/*
    - match: "HostRegexp(`^(preview-)?[a-z0-9-]+\\.vibeweb\\.localhost$`) && PathPrefix(`/api/`)"
      kind: Rule
      services:
        - name: function-runner
          port: 3001
      middlewares:
        - name: tenant-auth
      priority: 150

    # Preview WebSocket — *.{BASE_DOMAIN}/ws
    - match: "HostRegexp(`^(preview-)?[a-z0-9-]+\\.vibeweb\\.localhost$`) && PathPrefix(`/ws`)"
      kind: Rule
      services:
        - name: preview-server
          port: 3002
      middlewares:
        - name: tenant-auth
      priority: 140

    # Preview Static — preview-*.{BASE_DOMAIN}
    - match: "HostRegexp(`^preview-[a-z0-9-]+\\.vibeweb\\.localhost$`)"
      kind: Rule
      services:
        - name: preview-server
          port: 3002
      middlewares:
        - name: tenant-auth
      priority: 100

    # Agent WebSocket — *.{BASE_DOMAIN}/agent
    - match: "HostRegexp(`^[a-z0-9-]+\\.vibeweb\\.localhost$`) && PathPrefix(`/agent`)"
      kind: Rule
      services:
        - name: agent-service
          port: 3003
      middlewares:
        - name: tenant-auth
      priority: 90

    # Site Server (fallback) — *.{BASE_DOMAIN}
    - match: "HostRegexp(`^[a-z0-9-]+\\.vibeweb\\.localhost$`)"
      kind: Rule
      services:
        - name: nginx
          port: 80
      middlewares:
        - name: tenant-auth
      priority: 1
```

도메인 변경 시: Ingress의 Host/HostRegexp 값과 ConfigMap의 `BASE_DOMAIN`을 함께 수정.

## 서비스 Deployments

각 서비스는 동일 패턴:
- Deployment (replicas: 1, 개발환경)
- Service (ClusterIP)
- PVC `tenant-data` 마운트 (필요한 서비스만)
- ConfigMap/Secret envFrom

예시 (control-api):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: control-api
  namespace: vibeweb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: control-api
  template:
    metadata:
      labels:
        app: control-api
    spec:
      containers:
        - name: control-api
          image: localhost:5000/vibeweb-control-api:latest
          ports:
            - containerPort: 1919
          envFrom:
            - configMapRef:
                name: vibeweb-config
            - secretRef:
                name: vibeweb-secrets
          volumeMounts:
            - name: tenant-data
              mountPath: /data
      volumes:
        - name: tenant-data
          persistentVolumeClaim:
            claimName: tenant-data
---
apiVersion: v1
kind: Service
metadata:
  name: control-api
  namespace: vibeweb
spec:
  selector:
    app: control-api
  ports:
    - port: 1919
      targetPort: 1919
```

나머지 서비스(console, nginx, preview-server, function-runner, agent-service)도 동일 패턴. agent-service와 function-runner에는 `serviceAccountName: vibeweb-pod-manager` 추가.

## 함수 실행: K8s Pod

### container.ts 변경

`dockerode` → `@kubernetes/client-node`로 교체.

**Pod 스펙:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: fn-{tenantId-short}-{random}
  namespace: vibeweb
  labels:
    vibeweb.role: function-runner
    vibeweb.tenant: "{tenantId}"
spec:
  restartPolicy: Never
  activeDeadlineSeconds: 10
  containers:
    - name: runner
      image: localhost:5000/vibeweb-runner:node20
      env:
        - name: FUNCTION_PATH
          value: "{functionPath}"
        - name: FUNCTIONS_DIR
          value: "/tenant/preview/functions"
        - name: DB_DIR
          value: "/tenant/db"
        - name: REQ_METHOD / REQ_PATH / REQ_QUERY / REQ_HEADERS / REQ_BODY_B64
          value: "..."
      volumeMounts:
        - name: tenant-data
          mountPath: /tenant/preview/functions
          subPath: "{tenantId}/preview/functions"
          readOnly: true
        - name: tenant-data
          mountPath: /tenant/db
          subPath: "{tenantId}/db"
      resources:
        limits:
          memory: "128Mi"
          cpu: "500m"
  volumes:
    - name: tenant-data
      persistentVolumeClaim:
        claimName: tenant-data
```

**실행 흐름:**
1. `k8sApi.createNamespacedPod(namespace, podSpec)` — Pod 생성
2. Pod 상태 watch → `phase: Succeeded` 또는 `phase: Failed` 대기
3. `k8sApi.readNamespacedPodLog(name, namespace)` — stdout에서 JSON 응답 파싱
4. `k8sApi.deleteNamespacedPod(name, namespace)` — 정리
5. 타임아웃: `activeDeadlineSeconds: 10` + 클라이언트측 타이머 fallback

**네트워크 격리:**
```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-function-egress
  namespace: vibeweb
spec:
  podSelector:
    matchLabels:
      vibeweb.role: function-runner
  policyTypes: [Egress]
  egress: [] # 모든 외부 트래픽 차단
```

## 세션 Pod: K8s Pod

### session.ts 변경

`dockerode` → `@kubernetes/client-node`로 교체.

**Pod 스펙:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: session-{tenantId-short}-{random}
  namespace: vibeweb
  labels:
    vibeweb.role: agent-session
    vibeweb.tenant: "{tenantId}"
spec:
  restartPolicy: Never
  containers:
    - name: session
      image: localhost:5000/vibeweb-session:latest
      command: ["sh", "-c", "...existing startup script..."]
      ports:
        - containerPort: 3100
      env:
        - name: BRIDGE_PORT
          value: "3100"
        - name: CLAUDE_CODE_OAUTH_TOKEN / ANTHROPIC_API_KEY
          value: "..."
      volumeMounts:
        - name: tenant-data
          mountPath: /tenant/preview
          subPath: "{tenantId}/preview"
        - name: tenant-data
          mountPath: /tenant/db
          subPath: "{tenantId}/db"
        - name: tenant-data
          mountPath: /tenant/claude-auth
          subPath: "{tenantId}/claude-auth"
          readOnly: true
        - name: tenant-data
          mountPath: /tenant/claude-sessions
          subPath: "{tenantId}/claude-sessions"
      resources:
        limits:
          memory: "512Mi"
          cpu: "1"
  volumes:
    - name: tenant-data
      persistentVolumeClaim:
        claimName: tenant-data
```

**실행 흐름:**
1. `getOrCreateSession`: 기존 Pod이 Running 상태이면 재사용 (label selector로 조회)
2. 없으면 `k8sApi.createNamespacedPod()` → Pod 생성
3. Pod Ready 대기 → `pod.status.podIP` 획득
4. `ws://{podIP}:3100`으로 bridge 연결
5. `scheduleDestroy`: 5분 후 `k8sApi.deleteNamespacedPod()` — 기존 grace period 로직 유지

**기존 Pod 조회:**
```typescript
const pods = await k8sApi.listNamespacedPod(namespace, undefined, undefined, undefined, undefined,
  `vibeweb.role=agent-session,vibeweb.tenant=${tenantId}`);
```

## 코드 변경 범위

| 파일 | 변경 | 설명 |
|------|------|------|
| `packages/agent-service/src/session.ts` | 전면 재작성 | dockerode → K8s Pod API |
| `packages/function-runner/src/container.ts` | 전면 재작성 | dockerode → K8s Pod API |
| `packages/agent-service/src/index.ts` | 소폭 수정 | login 컨테이너도 K8s Pod으로 전환 |
| `packages/agent-service/package.json` | 의존성 변경 | dockerode 제거, @kubernetes/client-node 추가 |
| `packages/function-runner/package.json` | 의존성 변경 | 동일 |
| `packages/shared/src/constants.ts` | 추가 | NAMESPACE, PVC_NAME, REGISTRY 상수 |
| `docker-compose.yml` | 유지 | 로컬 개발용으로 병행 유지 (옵션) |

나머지 소스(control-api, console, preview-server, nginx, bridge.js, entrypoint.js, claude-md.ts 등)는 **변경 없음**.

## 빌드 & 배포 스크립트

`scripts/k8s-deploy.sh`:
```bash
#!/bin/bash
REGISTRY=localhost:5000

# Build and push all images
for svc in control-api function-runner preview-server agent-service console; do
  docker build -t $REGISTRY/vibeweb-$svc:latest -f packages/$svc/Dockerfile .
  docker push $REGISTRY/vibeweb-$svc:latest
done

# Build runner and session images
docker build -t $REGISTRY/vibeweb-runner:node20 runner-image/
docker push $REGISTRY/vibeweb-runner:node20
docker build -t $REGISTRY/vibeweb-session:latest session-image/
docker push $REGISTRY/vibeweb-session:latest

# Apply manifests
kubectl apply -f k8s/
```

## docker-compose.yml 처리

삭제하지 않고 유지. k3d 없이 빠르게 로컬 테스트할 때 사용 가능. 단, dockerode 기반 코드가 K8s API로 바뀌면 Docker Compose 환경에서는 세션/함수 실행이 안 되므로, `README.md`에 "K3s 환경 필수" 안내.

## 제외 사항

- 커스텀 도메인 UI (ConfigMap 수동 수정으로 대응)
- HTTPS/TLS (cert-manager 연동은 추후)
- 멀티노드 설정 (단일 노드 k3d로 개발)
- CI/CD 파이프라인
- Helm chart (plain manifests로 충분)
