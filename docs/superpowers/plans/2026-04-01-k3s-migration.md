# K3s Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate VibeWeb from Docker Compose to K3s (k3d), replacing all dockerode usage with K8s API calls.

**Architecture:** k3d local cluster with built-in registry. Static services become Deployments + Services. Function execution and session containers become dynamically-created K8s Pods via `@kubernetes/client-node`. Traefik Ingress replaces the separate Traefik config. Single PVC with subPath for tenant data isolation.

**Tech Stack:** k3d, K3s, @kubernetes/client-node, Traefik IngressRoute CRD, local-path-provisioner

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `k8s/namespace.yaml` | vibeweb namespace |
| Create | `k8s/storage.yaml` | PVC tenant-data |
| Create | `k8s/configmap.yaml` | Shared env (BASE_DOMAIN, etc.) |
| Create | `k8s/secret.yaml` | Sensitive env (tokens, keys) |
| Create | `k8s/rbac.yaml` | ServiceAccount + Role for Pod management |
| Create | `k8s/networkpolicy.yaml` | Block function Pod egress |
| Create | `k8s/ingress.yaml` | Traefik IngressRoute + Middleware |
| Create | `k8s/nginx.yaml` | Deployment + Service |
| Create | `k8s/console.yaml` | Deployment + Service |
| Create | `k8s/control-api.yaml` | Deployment + Service |
| Create | `k8s/preview-server.yaml` | Deployment + Service |
| Create | `k8s/function-runner.yaml` | Deployment + Service |
| Create | `k8s/agent-service.yaml` | Deployment + Service |
| Create | `scripts/k8s-setup.sh` | k3d cluster + registry creation |
| Create | `scripts/k8s-deploy.sh` | Build, push, apply manifests |
| Create | `packages/shared/src/k8s.ts` | Shared K8s client helper |
| Rewrite | `packages/function-runner/src/container.ts` | dockerode → K8s Pod API |
| Rewrite | `packages/agent-service/src/session.ts` | dockerode → K8s Pod API |
| Modify | `packages/agent-service/src/index.ts` | Login container → K8s Pod + Exec |
| Modify | `packages/agent-service/package.json` | dockerode → @kubernetes/client-node |
| Modify | `packages/function-runner/package.json` | dockerode → @kubernetes/client-node |
| Modify | `packages/shared/src/constants.ts` | Add K8s constants |

---

### Task 1: k3d setup script and K8s base manifests

**Files:**
- Create: `scripts/k8s-setup.sh`
- Create: `scripts/k8s-deploy.sh`
- Create: `k8s/namespace.yaml`
- Create: `k8s/storage.yaml`
- Create: `k8s/configmap.yaml`
- Create: `k8s/secret.yaml`
- Create: `k8s/rbac.yaml`
- Create: `k8s/networkpolicy.yaml`

- [ ] **Step 1: Create k8s-setup.sh**

```bash
#!/bin/bash
set -e

CLUSTER_NAME=vibeweb
REGISTRY_NAME=vibeweb-registry
REGISTRY_PORT=5000

# Create registry if not exists
if ! k3d registry list | grep -q $REGISTRY_NAME; then
  k3d registry create $REGISTRY_NAME --port $REGISTRY_PORT
fi

# Create cluster if not exists
if ! k3d cluster list | grep -q $CLUSTER_NAME; then
  k3d cluster create $CLUSTER_NAME \
    --registry-use k3d-$REGISTRY_NAME:$REGISTRY_PORT \
    --port "80:80@loadbalancer" \
    --port "8080:8080@loadbalancer" \
    --agents 0 \
    --k3s-arg "--disable=traefik@server:0"

  # Install Traefik CRDs (using Helm for IngressRoute support)
  kubectl apply -f https://raw.githubusercontent.com/traefik/traefik/v3.0/docs/content/reference/dynamic-configuration/kubernetes-crd-definition-v1.yml 2>/dev/null || true
  helm repo add traefik https://traefik.github.io/charts 2>/dev/null || true
  helm repo update
  helm install traefik traefik/traefik -n kube-system \
    --set ports.web.nodePort=80 \
    --set ports.web.expose.default=true \
    --set service.type=LoadBalancer
fi

echo "Cluster '$CLUSTER_NAME' ready. Registry at localhost:$REGISTRY_PORT"
```

- [ ] **Step 2: Create k8s-deploy.sh**

```bash
#!/bin/bash
set -e

REGISTRY=localhost:5000

echo "=== Building packages ==="
npx pnpm -r build

echo "=== Building and pushing images ==="
for svc in control-api function-runner preview-server agent-service; do
  echo "Building $svc..."
  docker build -t $REGISTRY/vibeweb-$svc:latest -f packages/$svc/Dockerfile .
  docker push $REGISTRY/vibeweb-$svc:latest
done

echo "Building console..."
docker build -t $REGISTRY/vibeweb-console:latest -f packages/console/Dockerfile .
docker push $REGISTRY/vibeweb-console:latest

echo "Building runner image..."
docker build -t $REGISTRY/vibeweb-runner:node20 runner-image/
docker push $REGISTRY/vibeweb-runner:node20

echo "Building session image..."
docker build -t $REGISTRY/vibeweb-session:latest session-image/
docker push $REGISTRY/vibeweb-session:latest

echo "=== Applying K8s manifests ==="
kubectl apply -f k8s/

echo "=== Restarting deployments ==="
kubectl rollout restart deployment -n vibeweb

echo "=== Done ==="
kubectl get pods -n vibeweb
```

- [ ] **Step 3: Create namespace.yaml**

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: vibeweb
```

- [ ] **Step 4: Create storage.yaml**

```yaml
# k8s/storage.yaml
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

- [ ] **Step 5: Create configmap.yaml**

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: vibeweb-config
  namespace: vibeweb
data:
  DATA_DIR: "/data"
  BASE_DOMAIN: "vibeweb.localhost"
  K8S_NAMESPACE: "vibeweb"
  K8S_PVC_NAME: "tenant-data"
  RUNNER_IMAGE: "localhost:5000/vibeweb-runner:node20"
  SESSION_IMAGE: "localhost:5000/vibeweb-session:latest"
```

- [ ] **Step 6: Create secret.yaml**

```yaml
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: vibeweb-secrets
  namespace: vibeweb
type: Opaque
stringData:
  ADMIN_API_KEY: "vibeweb-admin-secret"
  TOKEN_ENCRYPTION_KEY: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  ANTHROPIC_API_KEY: ""
```

- [ ] **Step 7: Create rbac.yaml**

```yaml
# k8s/rbac.yaml
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
    resources: ["pods", "pods/log", "pods/status", "pods/exec", "pods/attach"]
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

- [ ] **Step 8: Create networkpolicy.yaml**

```yaml
# k8s/networkpolicy.yaml
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
  egress: []
```

- [ ] **Step 9: Commit**

```bash
git add scripts/ k8s/namespace.yaml k8s/storage.yaml k8s/configmap.yaml k8s/secret.yaml k8s/rbac.yaml k8s/networkpolicy.yaml
git commit -m "feat: k3d setup scripts and K8s base manifests"
```

---

### Task 2: Service Deployment manifests

**Files:**
- Create: `k8s/nginx.yaml`
- Create: `k8s/console.yaml`
- Create: `k8s/control-api.yaml`
- Create: `k8s/preview-server.yaml`
- Create: `k8s/function-runner.yaml`
- Create: `k8s/agent-service.yaml`

- [ ] **Step 1: Create nginx.yaml**

```yaml
# k8s/nginx.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: vibeweb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:alpine
          ports:
            - containerPort: 80
          volumeMounts:
            - name: tenant-data
              mountPath: /data/tenants
              subPath: tenants
            - name: nginx-config
              mountPath: /etc/nginx/nginx.conf
              subPath: nginx.conf
      volumes:
        - name: tenant-data
          persistentVolumeClaim:
            claimName: tenant-data
        - name: nginx-config
          configMap:
            name: nginx-config
---
apiVersion: v1
kind: Service
metadata:
  name: nginx
  namespace: vibeweb
spec:
  selector:
    app: nginx
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
  namespace: vibeweb
data:
  nginx.conf: |
    worker_processes auto;
    events { worker_connections 1024; }
    http {
      include /etc/nginx/mime.types;
      default_type application/octet-stream;
      sendfile on;
      server {
        listen 80;
        server_name _;
        set $tenant_id $http_x_tenant_id;
        if ($tenant_id = "") { return 400 '{"error": "missing tenant id"}'; }
        if ($tenant_id !~ "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$") { return 400 '{"error": "invalid tenant id"}'; }
        root /data/tenants/$tenant_id/public;
        disable_symlinks on;
        location ~ /\.\. { deny all; return 403; }
        location ~ /\.git { deny all; return 404; }
        location / { try_files $uri $uri/ /index.html; }
        add_header X-Content-Type-Options nosniff always;
        add_header X-Frame-Options SAMEORIGIN always;
      }
    }
```

- [ ] **Step 2: Create console.yaml**

```yaml
# k8s/console.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: console
  namespace: vibeweb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: console
  template:
    metadata:
      labels:
        app: console
    spec:
      containers:
        - name: console
          image: localhost:5000/vibeweb-console:latest
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: console
  namespace: vibeweb
spec:
  selector:
    app: console
  ports:
    - port: 80
      targetPort: 80
```

- [ ] **Step 3: Create control-api.yaml**

```yaml
# k8s/control-api.yaml
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

- [ ] **Step 4: Create preview-server.yaml**

```yaml
# k8s/preview-server.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: preview-server
  namespace: vibeweb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: preview-server
  template:
    metadata:
      labels:
        app: preview-server
    spec:
      containers:
        - name: preview-server
          image: localhost:5000/vibeweb-preview-server:latest
          ports:
            - containerPort: 3002
          envFrom:
            - configMapRef:
                name: vibeweb-config
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
  name: preview-server
  namespace: vibeweb
spec:
  selector:
    app: preview-server
  ports:
    - port: 3002
      targetPort: 3002
```

- [ ] **Step 5: Create function-runner.yaml**

```yaml
# k8s/function-runner.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: function-runner
  namespace: vibeweb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: function-runner
  template:
    metadata:
      labels:
        app: function-runner
    spec:
      serviceAccountName: vibeweb-pod-manager
      containers:
        - name: function-runner
          image: localhost:5000/vibeweb-function-runner:latest
          ports:
            - containerPort: 3001
          envFrom:
            - configMapRef:
                name: vibeweb-config
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
  name: function-runner
  namespace: vibeweb
spec:
  selector:
    app: function-runner
  ports:
    - port: 3001
      targetPort: 3001
```

- [ ] **Step 6: Create agent-service.yaml**

```yaml
# k8s/agent-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-service
  namespace: vibeweb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: agent-service
  template:
    metadata:
      labels:
        app: agent-service
    spec:
      serviceAccountName: vibeweb-pod-manager
      containers:
        - name: agent-service
          image: localhost:5000/vibeweb-agent-service:latest
          ports:
            - containerPort: 3003
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
  name: agent-service
  namespace: vibeweb
spec:
  selector:
    app: agent-service
  ports:
    - port: 3003
      targetPort: 3003
```

- [ ] **Step 7: Commit**

```bash
git add k8s/nginx.yaml k8s/console.yaml k8s/control-api.yaml k8s/preview-server.yaml k8s/function-runner.yaml k8s/agent-service.yaml
git commit -m "feat: K8s Deployment and Service manifests for all services"
```

---

### Task 3: Ingress manifest

**Files:**
- Create: `k8s/ingress.yaml`

- [ ] **Step 1: Create ingress.yaml with Traefik IngressRoute and ForwardAuth**

```yaml
# k8s/ingress.yaml
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
    - match: "Host(`console.vibeweb.localhost`)"
      kind: Rule
      services:
        - name: console
          port: 80
      priority: 200

    - match: "Host(`vibeweb.localhost`)"
      kind: Rule
      services:
        - name: control-api
          port: 1919
      priority: 200

    - match: "HostRegexp(`^(preview-)?[a-z0-9-]+\\.vibeweb\\.localhost$`) && PathPrefix(`/api/`)"
      kind: Rule
      services:
        - name: function-runner
          port: 3001
      middlewares:
        - name: tenant-auth
      priority: 150

    - match: "HostRegexp(`^(preview-)?[a-z0-9-]+\\.vibeweb\\.localhost$`) && PathPrefix(`/ws`)"
      kind: Rule
      services:
        - name: preview-server
          port: 3002
      middlewares:
        - name: tenant-auth
      priority: 140

    - match: "HostRegexp(`^preview-[a-z0-9-]+\\.vibeweb\\.localhost$`)"
      kind: Rule
      services:
        - name: preview-server
          port: 3002
      middlewares:
        - name: tenant-auth
      priority: 100

    - match: "HostRegexp(`^[a-z0-9-]+\\.vibeweb\\.localhost$`) && PathPrefix(`/agent`)"
      kind: Rule
      services:
        - name: agent-service
          port: 3003
      middlewares:
        - name: tenant-auth
      priority: 90

    - match: "HostRegexp(`^[a-z0-9-]+\\.vibeweb\\.localhost$`)"
      kind: Rule
      services:
        - name: nginx
          port: 80
      middlewares:
        - name: tenant-auth
      priority: 1
```

- [ ] **Step 2: Commit**

```bash
git add k8s/ingress.yaml
git commit -m "feat: Traefik IngressRoute with ForwardAuth middleware"
```

---

### Task 4: Shared K8s constants and client helper

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/k8s.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add K8s constants**

Append to `packages/shared/src/constants.ts`:

```typescript
// K8s configuration (read from env, set via ConfigMap)
export const K8S_NAMESPACE = process.env.K8S_NAMESPACE ?? "vibeweb";
export const K8S_PVC_NAME = process.env.K8S_PVC_NAME ?? "tenant-data";
```

- [ ] **Step 2: Create k8s.ts helper**

```typescript
// packages/shared/src/k8s.ts
import * as k8s from "@kubernetes/client-node";

let _coreApi: k8s.CoreV1Api | null = null;

export function getK8sApi(): k8s.CoreV1Api {
  if (_coreApi) return _coreApi;
  const kc = new k8s.KubeConfig();
  kc.loadFromCluster(); // Uses in-cluster ServiceAccount
  _coreApi = kc.makeApiClient(k8s.CoreV1Api);
  return _coreApi;
}

export function getK8sConfig(): k8s.KubeConfig {
  const kc = new k8s.KubeConfig();
  kc.loadFromCluster();
  return kc;
}

/** Wait for a pod to reach a terminal phase (Succeeded or Failed) */
export async function waitForPod(api: k8s.CoreV1Api, namespace: string, name: string, timeoutMs: number): Promise<"Succeeded" | "Failed"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await api.readNamespacedPodStatus({ name, namespace });
    const phase = body.status?.phase;
    if (phase === "Succeeded" || phase === "Failed") return phase;
    await new Promise(r => setTimeout(r, 500));
  }
  // Timeout — delete the pod
  try { await api.deleteNamespacedPod({ name, namespace }); } catch {}
  throw new Error("Pod execution timed out");
}

/** Wait for pod to be Running and ready */
export async function waitForPodRunning(api: k8s.CoreV1Api, namespace: string, name: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await api.readNamespacedPodStatus({ name, namespace });
    const phase = body.status?.phase;
    if (phase === "Running" && body.status?.podIP) return body.status.podIP;
    if (phase === "Failed") throw new Error("Pod failed to start");
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Pod did not become Running in time");
}
```

- [ ] **Step 3: Export from index.ts**

Append to `packages/shared/src/index.ts`:

```typescript
export * from "./k8s.js";
```

- [ ] **Step 4: Add @kubernetes/client-node to shared package**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx pnpm add @kubernetes/client-node -F @vibeweb/shared`

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/shared/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add packages/shared/
git commit -m "feat: shared K8s client helper and constants"
```

---

### Task 5: Rewrite function-runner container.ts

**Files:**
- Rewrite: `packages/function-runner/src/container.ts`
- Modify: `packages/function-runner/package.json`

- [ ] **Step 1: Replace dockerode with @kubernetes/client-node in package.json**

In `packages/function-runner/package.json`, replace dependencies:

```json
"dependencies": {
  "@vibeweb/shared": "workspace:*",
  "fastify": "^5.0.0"
}
```

Remove `dockerode`. The K8s client comes from `@vibeweb/shared`.

Remove from devDependencies: `"@types/dockerode": "^3.3.0"`

- [ ] **Step 2: Rewrite container.ts**

```typescript
// packages/function-runner/src/container.ts
import { RUNNER_IMAGE, FUNCTION_TIMEOUT_MS, FUNCTION_MEMORY_LIMIT, FUNCTION_CPU_LIMIT, K8S_NAMESPACE, K8S_PVC_NAME } from "@vibeweb/shared";
import { getK8sApi, waitForPod } from "@vibeweb/shared";
import type { FunctionRequest, FunctionResponse } from "@vibeweb/shared";
import * as k8s from "@kubernetes/client-node";
import crypto from "node:crypto";

const RUNNER_IMAGE_K8S = process.env.RUNNER_IMAGE ?? RUNNER_IMAGE;

export interface RunFunctionOpts {
  tenantId: string;
  functionPath: string;
  functionsDir: string;
  dbDir: string;
  request: FunctionRequest;
}

export async function runInContainer(opts: RunFunctionOpts): Promise<FunctionResponse> {
  const { tenantId, functionPath, request } = opts;
  if (!/^[a-f0-9-]{36}$/.test(tenantId)) throw new Error("Invalid tenant ID");

  const api = getK8sApi();
  const namespace = K8S_NAMESPACE;
  const podName = `fn-${tenantId.slice(0, 8)}-${crypto.randomBytes(4).toString("hex")}`;

  const pod: k8s.V1Pod = {
    metadata: {
      name: podName,
      namespace,
      labels: {
        "vibeweb.role": "function-runner",
        "vibeweb.tenant": tenantId,
      },
    },
    spec: {
      restartPolicy: "Never",
      activeDeadlineSeconds: Math.ceil(FUNCTION_TIMEOUT_MS / 1000),
      containers: [
        {
          name: "runner",
          image: RUNNER_IMAGE_K8S,
          env: [
            { name: "FUNCTION_PATH", value: functionPath },
            { name: "FUNCTIONS_DIR", value: "/tenant/preview/functions" },
            { name: "DB_DIR", value: "/tenant/db" },
            { name: "REQ_METHOD", value: request.method },
            { name: "REQ_PATH", value: request.path },
            { name: "REQ_QUERY", value: JSON.stringify(request.query) },
            { name: "REQ_HEADERS", value: JSON.stringify(request.headers) },
            { name: "REQ_BODY_B64", value: Buffer.from(request.body || "").toString("base64") },
          ],
          volumeMounts: [
            { name: "tenant-data", mountPath: "/tenant/preview/functions", subPath: `${tenantId}/preview/functions`, readOnly: true },
            { name: "tenant-data", mountPath: "/tenant/db", subPath: `${tenantId}/db` },
          ],
          resources: {
            limits: {
              memory: FUNCTION_MEMORY_LIMIT,
              cpu: String(FUNCTION_CPU_LIMIT),
            },
          },
        },
      ],
      volumes: [
        { name: "tenant-data", persistentVolumeClaim: { claimName: K8S_PVC_NAME } },
      ],
    },
  };

  try {
    await api.createNamespacedPod({ namespace, body: pod });

    const phase = await waitForPod(api, namespace, podName, FUNCTION_TIMEOUT_MS + 5000);

    const { body: logBody } = await api.readNamespacedPodLog({ name: podName, namespace });
    const output = typeof logBody === "string" ? logBody.trim() : "";
    const lines = output.split("\n");
    const lastLine = lines[lines.length - 1];
    const jsonMatch = lastLine?.match(/\{.*\}/);

    if (!jsonMatch) {
      return { status: 500, headers: {}, body: { error: phase === "Failed" ? "Function execution failed" : "No response from function" } };
    }

    try {
      return JSON.parse(jsonMatch[0]) as FunctionResponse;
    } catch {
      return { status: 500, headers: {}, body: { error: "Invalid response from function" } };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("timed out")) {
      return { status: 504, headers: {}, body: { error: "Function execution timed out" } };
    }
    return { status: 500, headers: {}, body: { error: message } };
  } finally {
    try { await api.deleteNamespacedPod({ name: podName, namespace }); } catch {}
  }
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/function-runner/tsconfig.json 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add packages/function-runner/
git commit -m "feat: rewrite function-runner to use K8s Pod API instead of dockerode"
```

---

### Task 6: Rewrite agent-service session.ts

**Files:**
- Rewrite: `packages/agent-service/src/session.ts`
- Modify: `packages/agent-service/package.json`

- [ ] **Step 1: Update package.json dependencies**

In `packages/agent-service/package.json`, remove `dockerode` and `@types/dockerode`, keep the rest:

```json
"dependencies": {
  "@vibeweb/shared": "workspace:*",
  "fastify": "^5.0.0",
  "ws": "^8.0.0",
  "better-sqlite3": "^11.0.0",
  "uuid": "^11.0.0"
}
```

Remove from devDependencies: `"@types/dockerode": "^3.3.0"`

- [ ] **Step 2: Rewrite session.ts**

```typescript
// packages/agent-service/src/session.ts
import { SESSION_IMAGE, SESSION_BRIDGE_PORT, SESSION_MEMORY_LIMIT, SESSION_CPU_LIMIT, K8S_NAMESPACE, K8S_PVC_NAME } from "@vibeweb/shared";
import { getK8sApi, waitForPodRunning } from "@vibeweb/shared";
import crypto from "node:crypto";

const GRACE_PERIOD_MS = 5 * 60 * 1000;
const SESSION_IMAGE_K8S = process.env.SESSION_IMAGE ?? SESSION_IMAGE;

export interface CreateSessionOpts {
  tenantId: string;
  sessionId: string;
  claudeMdContent: string;
  authToken: string | null;
}

export interface SessionInfo {
  sessionId: string;
  tenantId: string;
  podName: string;
  bridgePort: number;
  bridgeHost: string;
  startedAt: string;
}

export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private tenantSessions = new Map<string, string>();
  private destroyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private tenantsDir: string) {}

  async getOrCreateSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId } = opts;
    const api = getK8sApi();
    const namespace = K8S_NAMESPACE;

    const existingSessionId = this.tenantSessions.get(tenantId);
    if (existingSessionId) {
      const existing = this.sessions.get(existingSessionId);
      if (existing) {
        this.cancelDestroyTimer(existingSessionId);
        try {
          const { body } = await api.readNamespacedPodStatus({ name: existing.podName, namespace });
          if (body.status?.phase === "Running") {
            existing.sessionId = opts.sessionId;
            this.sessions.delete(existingSessionId);
            this.sessions.set(opts.sessionId, existing);
            this.tenantSessions.set(tenantId, opts.sessionId);
            return existing;
          }
        } catch { /* pod gone */ }
        this.sessions.delete(existingSessionId);
        this.tenantSessions.delete(tenantId);
      }
    }

    return this.createSession(opts);
  }

  private async createSession(opts: CreateSessionOpts): Promise<SessionInfo> {
    const { tenantId, sessionId, authToken } = opts;
    if (!/^[a-f0-9-]{36}$/.test(tenantId)) throw new Error("Invalid tenant ID");

    const api = getK8sApi();
    const namespace = K8S_NAMESPACE;
    const podName = `session-${tenantId.slice(0, 8)}-${crypto.randomBytes(4).toString("hex")}`;

    const env: { name: string; value: string }[] = [
      { name: "BRIDGE_PORT", value: String(SESSION_BRIDGE_PORT) },
      { name: "WORKSPACE", value: "/tenant/preview" },
    ];
    if (authToken) {
      if (authToken.startsWith("sk-ant-oat")) {
        env.push({ name: "CLAUDE_CODE_OAUTH_TOKEN", value: authToken });
      } else {
        env.push({ name: "ANTHROPIC_API_KEY", value: authToken });
      }
    }

    const pod = {
      metadata: {
        name: podName,
        namespace,
        labels: {
          "vibeweb.role": "agent-session",
          "vibeweb.tenant": tenantId,
        },
      },
      spec: {
        restartPolicy: "Never" as const,
        containers: [
          {
            name: "session",
            image: SESSION_IMAGE_K8S,
            command: ["sh", "-c", `
              mkdir -p /home/vibe/.claude /tenant/preview /tenant/db /tenant/claude-sessions /data &&
              cp -a /tenant/claude-auth/. /home/vibe/.claude/ 2>/dev/null;
              test -f /tenant/claude-auth/.claude.json && cp /tenant/claude-auth/.claude.json /home/vibe/.claude.json 2>/dev/null;
              rm -rf /home/vibe/.claude/sessions;
              ln -sf /tenant/claude-sessions /home/vibe/.claude/sessions;
              chown -R vibe:vibe /home/vibe /tenant/preview /tenant/db /tenant/claude-sessions 2>/dev/null;
              ln -sf /tenant/db /data/db;
              exec su vibe -c "HOME=/home/vibe WORKSPACE=/tenant/preview BRIDGE_PORT=${SESSION_BRIDGE_PORT} NODE_PATH=/opt/libs/node_modules CLAUDE_CODE_OAUTH_TOKEN=\${CLAUDE_CODE_OAUTH_TOKEN:-} ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-} node /opt/bridge/bridge.js"
            `],
            ports: [{ containerPort: SESSION_BRIDGE_PORT }],
            env,
            volumeMounts: [
              { name: "tenant-data", mountPath: "/tenant/preview", subPath: `${tenantId}/preview` },
              { name: "tenant-data", mountPath: "/tenant/db", subPath: `${tenantId}/db` },
              { name: "tenant-data", mountPath: "/tenant/claude-auth", subPath: `${tenantId}/claude-auth`, readOnly: true },
              { name: "tenant-data", mountPath: "/tenant/claude-sessions", subPath: `${tenantId}/claude-sessions` },
            ],
            resources: {
              limits: {
                memory: SESSION_MEMORY_LIMIT,
                cpu: String(SESSION_CPU_LIMIT),
              },
            },
          },
        ],
        volumes: [
          { name: "tenant-data", persistentVolumeClaim: { claimName: K8S_PVC_NAME } },
        ],
      },
    };

    await api.createNamespacedPod({ namespace, body: pod });
    const podIp = await waitForPodRunning(api, namespace, podName, 60_000);

    const session: SessionInfo = {
      sessionId, tenantId, podName,
      bridgePort: SESSION_BRIDGE_PORT, bridgeHost: podIp,
      startedAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    this.tenantSessions.set(tenantId, sessionId);
    return session;
  }

  scheduleDestroy(sessionId: string): void {
    this.cancelDestroyTimer(sessionId);
    const timer = setTimeout(() => { this.destroySession(sessionId); }, GRACE_PERIOD_MS);
    this.destroyTimers.set(sessionId, timer);
  }

  private cancelDestroyTimer(sessionId: string): void {
    const timer = this.destroyTimers.get(sessionId);
    if (timer) { clearTimeout(timer); this.destroyTimers.delete(sessionId); }
  }

  async destroySession(sessionId: string): Promise<void> {
    this.cancelDestroyTimer(sessionId);
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const api = getK8sApi();
    try { await api.deleteNamespacedPod({ name: session.podName, namespace: K8S_NAMESPACE }); } catch {}
    this.sessions.delete(sessionId);
    this.tenantSessions.delete(session.tenantId);
  }

  getSession(sessionId: string): SessionInfo | undefined { return this.sessions.get(sessionId); }
  getSessionByTenant(tenantId: string): SessionInfo | undefined {
    const sid = this.tenantSessions.get(tenantId);
    return sid ? this.sessions.get(sid) : undefined;
  }

  async cleanupOrphanPods(): Promise<void> {
    const api = getK8sApi();
    try {
      const { body } = await api.listNamespacedPod({ namespace: K8S_NAMESPACE, labelSelector: "vibeweb.role=agent-session" });
      for (const pod of body.items) {
        if (pod.metadata?.name) {
          try { await api.deleteNamespacedPod({ name: pod.metadata.name, namespace: K8S_NAMESPACE }); } catch {}
        }
      }
    } catch {}
    this.sessions.clear();
    this.tenantSessions.clear();
    this.destroyTimers.forEach(t => clearTimeout(t));
    this.destroyTimers.clear();
  }
}
```

- [ ] **Step 3: Update session.test.ts**

```typescript
// packages/agent-service/src/__tests__/session.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @kubernetes/client-node before importing
vi.mock("@kubernetes/client-node", () => ({ KubeConfig: vi.fn() }));
vi.mock("@vibeweb/shared", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    getK8sApi: vi.fn().mockReturnValue({
      createNamespacedPod: vi.fn().mockResolvedValue({}),
      readNamespacedPodStatus: vi.fn().mockResolvedValue({ body: { status: { phase: "Running", podIP: "10.42.0.5" } } }),
      deleteNamespacedPod: vi.fn().mockResolvedValue({}),
      listNamespacedPod: vi.fn().mockResolvedValue({ body: { items: [] } }),
    }),
    waitForPodRunning: vi.fn().mockResolvedValue("10.42.0.5"),
  };
});

import { SessionManager } from "../session.js";

describe("SessionManager", () => {
  let manager: SessionManager;
  beforeEach(() => { manager = new SessionManager("/data/tenants"); });

  it("creates a session pod", async () => {
    const session = await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-123", claudeMdContent: "# Test", authToken: "test-token" });
    expect(session.podName).toMatch(/^session-aaaaaaaa-/);
    expect(session.bridgeHost).toBe("10.42.0.5");
  });

  it("reuses existing pod for same tenant", async () => {
    const s1 = await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-1", claudeMdContent: "# Test", authToken: "token" });
    const s2 = await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-2", claudeMdContent: "# Test", authToken: "token" });
    expect(s2.podName).toBe(s1.podName);
  });

  it("destroys a session pod", async () => {
    await manager.getOrCreateSession({ tenantId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", sessionId: "session-1", claudeMdContent: "# Test", authToken: "token" });
    await manager.destroySession("session-1");
    expect(manager.getSession("session-1")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/agent-service/tsconfig.json 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add packages/agent-service/
git commit -m "feat: rewrite session manager to use K8s Pod API instead of dockerode"
```

---

### Task 7: Update agent-service index.ts (login container → K8s Pod)

**Files:**
- Modify: `packages/agent-service/src/index.ts`

- [ ] **Step 1: Replace Docker imports and login container logic**

In `packages/agent-service/src/index.ts`:

Replace Docker import and initialization (lines 1-14 area):

Remove:
```typescript
import Docker from "dockerode";
```
```typescript
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
```

Add:
```typescript
import { getK8sApi, K8S_NAMESPACE, K8S_PVC_NAME } from "@vibeweb/shared";
import * as k8s from "@kubernetes/client-node";
```

Replace `loginContainers` map type:

```typescript
const loginContainers = new Map<string, { podName: string }>();
```

Replace the entire `POST /auth/claude/:tenantId/login` handler to use K8s Pod + exec. Since K8s exec is complex for interactive TTY, simplify the flow:
- Create a Pod that runs `claude setup-token --print-url` (if available) or capture from logs
- Monitor Pod logs for the OAuth URL
- For code submission, exec into the running Pod

The login flow is the most Docker-specific part. For K8s, use a simpler approach:
- Create a login Pod
- Read its logs to capture the OAuth URL
- Use `kubectl exec` equivalent to send the code

Replace the login endpoint with:

```typescript
// POST /auth/claude/:tenantId/login
app.post<{ Params: { tenantId: string } }>("/auth/claude/:tenantId/login", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
  fs.mkdirSync(claudeAuthDir, { recursive: true });

  // Clean up previous login pod
  const prev = loginContainers.get(tenantId);
  if (prev) {
    try { await getK8sApi().deleteNamespacedPod({ name: prev.podName, namespace: K8S_NAMESPACE }); } catch {}
    loginContainers.delete(tenantId);
  }

  const podName = `login-${tenantId.slice(0, 8)}-${Date.now().toString(36)}`;

  try {
    const pod: k8s.V1Pod = {
      metadata: {
        name: podName,
        namespace: K8S_NAMESPACE,
        labels: { "vibeweb.role": "auth-login", "vibeweb.tenant": tenantId },
      },
      spec: {
        restartPolicy: "Never",
        containers: [{
          name: "login",
          image: process.env.SESSION_IMAGE ?? "localhost:5000/vibeweb-session:latest",
          command: ["sh", "-c", `
            mkdir -p /tenant/claude-auth /home/vibe/.claude &&
            cp -a /tenant/claude-auth/. /home/vibe/.claude/ 2>/dev/null;
            chown -R vibe:vibe /home/vibe /tenant/claude-auth 2>/dev/null;
            su vibe -c "HOME=/home/vibe claude setup-token" < /dev/stdin
          `],
          stdin: true,
          tty: true,
          volumeMounts: [
            { name: "tenant-data", mountPath: "/tenant/claude-auth", subPath: `${tenantId}/claude-auth` },
          ],
          resources: { limits: { memory: "256Mi", cpu: "500m" } },
        }],
        volumes: [
          { name: "tenant-data", persistentVolumeClaim: { claimName: K8S_PVC_NAME } },
        ],
      },
    };

    const api = getK8sApi();
    await api.createNamespacedPod({ namespace: K8S_NAMESPACE, body: pod });

    // Wait for pod to be running
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const { body } = await api.readNamespacedPodStatus({ name: podName, namespace: K8S_NAMESPACE });
      if (body.status?.phase === "Running") break;
      if (body.status?.phase === "Failed") throw new Error("Login pod failed to start");
      await new Promise(r => setTimeout(r, 500));
    }

    // Read logs to capture OAuth URL
    const url = await new Promise<string>((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for OAuth URL. Output: " + output.substring(0, 500))), 30_000);

      const pollLogs = async () => {
        try {
          const { body: logBody } = await api.readNamespacedPodLog({ name: podName, namespace: K8S_NAMESPACE });
          output = typeof logBody === "string" ? logBody : "";
          const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/[\r\n\t]/g, "").replace(/[^\x20-\x7E]/g, "");
          const m = clean.match(/(https:\/\/claude\.com\/cai\/oauth\/authorize\?[^]*?state=[A-Za-z0-9_-]+)/);
          if (m) { clearTimeout(timeout); resolve(m[1].replace(/Paste.*$/, "")); return; }
        } catch {}
        if (Date.now() < deadline) setTimeout(pollLogs, 1000);
      };
      pollLogs();
    });

    loginContainers.set(tenantId, { podName });

    // Auto-cleanup after 5 minutes
    setTimeout(async () => {
      if (loginContainers.has(tenantId)) {
        try { await api.deleteNamespacedPod({ name: loginContainers.get(tenantId)!.podName, namespace: K8S_NAMESPACE }); } catch {}
        loginContainers.delete(tenantId);
      }
    }, 300_000);

    return { url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start login";
    try { await getK8sApi().deleteNamespacedPod({ name: podName, namespace: K8S_NAMESPACE }); } catch {}
    return reply.status(500).send({ error: message });
  }
});
```

Replace the `POST /auth/claude/:tenantId/code` handler:

```typescript
app.post<{ Params: { tenantId: string }; Body: { code: string } }>("/auth/claude/:tenantId/code", async (req, reply) => {
  const { tenantId } = req.params;
  if (!isValidTenantId(tenantId)) return reply.status(400).send({ error: "Invalid tenant ID" });
  const { code } = req.body;
  if (!code) return reply.status(400).send({ error: "code is required" });

  const entry = loginContainers.get(tenantId);
  if (!entry) return reply.status(404).send({ error: "No active login session. Click Connect first." });

  try {
    const kc = new (await import("@kubernetes/client-node")).KubeConfig();
    kc.loadFromCluster();
    const exec = new (await import("@kubernetes/client-node")).Exec(kc);

    // Exec into the login pod to send the code via stdin
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout")), 60_000);
      exec.exec(K8S_NAMESPACE, entry.podName, "login",
        ["sh", "-c", `echo '${code.replace(/'/g, "'\\''")}' | su vibe -c "cat > /dev/stdin"`],
        process.stdout, process.stderr, null, false,
        (status) => { clearTimeout(timeout); resolve(); }
      ).catch(reject);
    });

    // Wait for pod to complete
    const api = getK8sApi();
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const { body } = await api.readNamespacedPodStatus({ name: entry.podName, namespace: K8S_NAMESPACE });
      if (body.status?.phase !== "Running") break;
      await new Promise(r => setTimeout(r, 1000));
    }

    loginContainers.delete(tenantId);

    // Check if credentials were saved
    const claudeAuthDir = path.join(tenantsDir, tenantId, "claude-auth");
    const claudeJsonPath = path.join(claudeAuthDir, ".claude.json");
    if (!fs.existsSync(claudeJsonPath)) {
      fs.mkdirSync(claudeAuthDir, { recursive: true });
      fs.writeFileSync(claudeJsonPath, JSON.stringify({ hasCompletedOnboarding: true, theme: "light" }));
    }
    const hasCredentials = checkCredentials(claudeAuthDir);
    return { success: hasCredentials };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to exchange code";
    loginContainers.delete(tenantId);
    return reply.status(500).send({ error: message });
  }
});
```

Also update `cleanupOrphanContainers` call in `start()` to `cleanupOrphanPods`:

Replace: `await sessionManager.cleanupOrphanContainers();`
With: `await sessionManager.cleanupOrphanPods();`

Remove the `Docker` import and `docker` constant entirely.

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/cloudchamb3r/projects/vibeweb && npx tsc --noEmit -p packages/agent-service/tsconfig.json 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add packages/agent-service/
git commit -m "feat: replace all dockerode usage with K8s API in agent-service"
```

---

### Task 8: Remove Docker socket from Dockerfiles

**Files:**
- Modify: `packages/agent-service/Dockerfile`
- Modify: `packages/function-runner/Dockerfile`

- [ ] **Step 1: Remove Docker socket volume mounts from Dockerfiles if present**

The Dockerfiles themselves don't mount Docker socket (that was in docker-compose.yml), but verify they don't reference dockerode:

Check `packages/agent-service/Dockerfile` — it installs deps via pnpm which will now install `@kubernetes/client-node` instead of `dockerode`. No Dockerfile changes needed unless there are Docker-specific steps.

Check `packages/function-runner/Dockerfile` — same situation. No changes needed.

- [ ] **Step 2: Commit (if any changes)**

```bash
git add packages/agent-service/Dockerfile packages/function-runner/Dockerfile
git commit -m "chore: remove Docker socket dependencies from Dockerfiles"
```

---

### Task 9: Build, deploy, and verify

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/cloudchamb3r/projects/vibeweb && npx pnpm install
```

- [ ] **Step 2: Build all packages**

```bash
npx pnpm -r build
```

- [ ] **Step 3: Make scripts executable**

```bash
chmod +x scripts/k8s-setup.sh scripts/k8s-deploy.sh
```

- [ ] **Step 4: Create k3d cluster**

```bash
./scripts/k8s-setup.sh
```

- [ ] **Step 5: Deploy**

```bash
./scripts/k8s-deploy.sh
```

- [ ] **Step 6: Verify all pods are running**

```bash
kubectl get pods -n vibeweb
```

Expected: All Deployments show 1/1 Running.

- [ ] **Step 7: Test console access**

Open: `http://console.vibeweb.localhost/`
Expected: Console login page loads.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A && git commit -m "chore: fix build/deploy issues from K3s migration"
```
