import * as k8s from "@kubernetes/client-node";

let _coreApi: k8s.CoreV1Api | null = null;
let _kubeConfig: k8s.KubeConfig | null = null;

function getKubeConfig(): k8s.KubeConfig {
  if (_kubeConfig) return _kubeConfig;
  _kubeConfig = new k8s.KubeConfig();
  try {
    _kubeConfig.loadFromCluster();
  } catch {
    _kubeConfig.loadFromDefault();
  }
  return _kubeConfig;
}

export function getK8sApi(): k8s.CoreV1Api {
  if (_coreApi) return _coreApi;
  _coreApi = getKubeConfig().makeApiClient(k8s.CoreV1Api);
  return _coreApi;
}

export function getK8sConfig(): k8s.KubeConfig {
  return getKubeConfig();
}

/** Wait for a pod to reach a terminal phase (Succeeded or Failed) */
export async function waitForPod(api: k8s.CoreV1Api, namespace: string, name: string, timeoutMs: number): Promise<"Succeeded" | "Failed"> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pod = await api.readNamespacedPodStatus({ name, namespace });
    const phase = pod?.status?.phase;
    if (phase === "Succeeded" || phase === "Failed") return phase as "Succeeded" | "Failed";
    await new Promise(r => setTimeout(r, 200));
  }
  try { await api.deleteNamespacedPod({ name, namespace }); } catch {}
  throw new Error("Pod execution timed out");
}

/** Wait for pod to be Running with an IP */
export async function waitForPodRunning(api: k8s.CoreV1Api, namespace: string, name: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pod = await api.readNamespacedPodStatus({ name, namespace });
    const phase = pod?.status?.phase;
    if (phase === "Running" && pod.status?.podIP) return pod.status.podIP;
    if (phase === "Failed") throw new Error("Pod failed to start");
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error("Pod did not become Running in time");
}
