import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useChatContext } from "@/components/ChatLayout";
import { readFile } from "@/api";
import { Plug, Send, ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

interface OpenApiSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, MethodSpec>>;
}

interface MethodSpec {
  summary?: string;
  description?: string;
  parameters?: ParamSpec[];
  requestBody?: { content?: Record<string, { schema?: any; example?: any }> };
  responses?: Record<string, { description?: string; content?: Record<string, { schema?: any; example?: any }> }>;
}

interface ParamSpec {
  name: string;
  in: string;
  required?: boolean;
  schema?: { type?: string; default?: any };
  description?: string;
}

interface Endpoint {
  path: string;
  method: string;
  spec: MethodSpec;
}

const METHOD_COLORS: Record<string, string> = {
  get: "bg-emerald-100 text-emerald-700",
  post: "bg-blue-100 text-blue-700",
  put: "bg-amber-100 text-amber-700",
  patch: "bg-orange-100 text-orange-700",
  delete: "bg-red-100 text-red-700",
};

export function ApiPage() {
  const { t } = useTranslation();
  const { tenantId } = useParams<{ tenantId: string }>();
  const { subdomain } = useChatContext();
  const [spec, setSpec] = useState<OpenApiSpec | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [selected, setSelected] = useState<Endpoint | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    readFile(tenantId, "functions/openapi.json")
      .then((text) => {
        const parsed = JSON.parse(text) as OpenApiSpec;
        setSpec(parsed);
        const eps: Endpoint[] = [];
        for (const [path, methods] of Object.entries(parsed.paths || {})) {
          for (const [method, methodSpec] of Object.entries(methods)) {
            if (["get", "post", "put", "patch", "delete"].includes(method.toLowerCase())) {
              eps.push({ path, method: method.toUpperCase(), spec: methodSpec });
            }
          }
        }
        setEndpoints(eps);
        if (eps.length > 0) setSelected(eps[0]);
      })
      .catch(() => { setSpec(null); setEndpoints([]); })
      .finally(() => setLoading(false));
  }, [tenantId]);

  if (loading) return <div className="p-8 text-gray-400">{t("common.loading")}</div>;

  if (endpoints.length === 0) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-2xl font-bold mb-6">{t("api.title")}</h1>
        <div className="text-center py-12 text-gray-400">
          <Plug className="w-8 h-8 mx-auto mb-2" />
          <p>{spec ? t("api.noApis") : t("api.noSpec")}</p>
          <p className="text-xs mt-1">{spec ? t("api.noApisDesc") : t("api.noSpecDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: endpoint list */}
      <div className="w-72 border-r border-gray-200 overflow-y-auto flex-shrink-0">
        <div className="px-4 py-3 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-900">{t("api.title")}</h1>
          {spec?.info?.description && <p className="text-xs text-gray-400 mt-1">{spec.info.description}</p>}
        </div>
        <div className="py-1">
          {endpoints.map((ep) => (
            <button
              key={`${ep.method}-${ep.path}`}
              onClick={() => setSelected(ep)}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                selected?.path === ep.path && selected?.method === ep.method ? "bg-violet-50 border-r-2 border-violet-500" : ""
              }`}
            >
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${METHOD_COLORS[ep.method.toLowerCase()] || "bg-gray-100 text-gray-600"}`}>
                {ep.method}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[13px] font-mono text-gray-700 block truncate">{ep.path}</span>
                {ep.spec.summary && <span className="text-[11px] text-gray-400 block truncate">{ep.spec.summary}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail + try it */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <EndpointDetail endpoint={selected} subdomain={subdomain} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">{t("api.selectEndpoint")}</div>
        )}
      </div>
    </div>
  );
}

function EndpointDetail({ endpoint, subdomain }: { endpoint: Endpoint; subdomain: string }) {
  const { t } = useTranslation();
  const { path, method, spec } = endpoint;
  const [tryOpen, setTryOpen] = useState(false);
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [bodyValue, setBodyValue] = useState("");
  const [response, setResponse] = useState<{ status: number; body: string; time: number } | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset state when endpoint changes
  useEffect(() => {
    setTryOpen(false);
    setResponse(null);
    setSending(false);
    // Pre-fill body with example if available
    const reqBody = spec.requestBody?.content?.["application/json"];
    if (reqBody?.example) {
      setBodyValue(JSON.stringify(reqBody.example, null, 2));
    } else if (reqBody?.schema) {
      setBodyValue(JSON.stringify(schemaToExample(reqBody.schema), null, 2));
    } else {
      setBodyValue("");
    }
    // Pre-fill params with defaults
    const defaults: Record<string, string> = {};
    for (const p of spec.parameters || []) {
      if (p.schema?.default !== undefined) defaults[p.name] = String(p.schema.default);
    }
    setParamValues(defaults);
  }, [endpoint]);

  const buildUrl = useCallback(() => {
    const queryParams = (spec.parameters || []).filter(p => p.in === "query");
    const query = queryParams
      .map(p => paramValues[p.name] ? `${p.name}=${encodeURIComponent(paramValues[p.name])}` : null)
      .filter(Boolean)
      .join("&");
    let url = path;
    // Replace path params
    for (const p of (spec.parameters || []).filter(p => p.in === "path")) {
      url = url.replace(`{${p.name}}`, paramValues[p.name] || `{${p.name}}`);
    }
    return query ? `${url}?${query}` : url;
  }, [path, spec, paramValues]);

  const handleSend = async () => {
    setSending(true);
    setResponse(null);
    const url = buildUrl();
    const baseUrl = subdomain ? `${window.location.protocol}//preview-${subdomain}.${window.location.host.replace(/^[^.]+\./, "")}` : "";
    const fullUrl = `${baseUrl}${url}`;
    const start = performance.now();
    try {
      const opts: RequestInit = { method };
      if (["POST", "PUT", "PATCH"].includes(method) && bodyValue.trim()) {
        opts.headers = { "Content-Type": "application/json" };
        opts.body = bodyValue;
      }
      const res = await fetch(fullUrl, opts);
      const text = await res.text();
      const time = Math.round(performance.now() - start);
      let formatted = text;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      setResponse({ status: res.status, body: formatted, time });
    } catch (err) {
      const time = Math.round(performance.now() - start);
      setResponse({ status: 0, body: err instanceof Error ? err.message : "Network error", time });
    }
    setSending(false);
  };

  const handleCopy = () => {
    if (response) {
      navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const queryParams = (spec.parameters || []).filter(p => p.in === "query");
  const pathParams = (spec.parameters || []).filter(p => p.in === "path");
  const allParams = [...pathParams, ...queryParams];
  const hasBody = ["POST", "PUT", "PATCH"].includes(method);
  const successResponse = spec.responses?.["200"] || spec.responses?.["201"];
  const responseExample = successResponse?.content?.["application/json"]?.example;

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <span className={`text-xs font-bold px-2 py-1 rounded ${METHOD_COLORS[method.toLowerCase()] || "bg-gray-100"}`}>
          {method}
        </span>
        <code className="text-lg font-mono text-gray-800">{path}</code>
      </div>
      {spec.summary && <p className="text-sm text-gray-600 mb-1">{spec.summary}</p>}
      {spec.description && <p className="text-xs text-gray-400 mb-4">{spec.description}</p>}

      {/* Parameters */}
      {allParams.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("api.params")}</h3>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">In</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-500 text-xs">Description</th>
                </tr>
              </thead>
              <tbody>
                {allParams.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs">
                      {p.name}{p.required && <span className="text-red-500">*</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-400">{p.in}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">{p.schema?.type || "string"}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{p.description || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Request Body Schema */}
      {hasBody && spec.requestBody && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("api.requestBody")}</h3>
          <pre className="bg-gray-50 border rounded-lg p-3 text-xs font-mono text-gray-600 overflow-x-auto">
            {JSON.stringify(spec.requestBody.content?.["application/json"]?.schema || spec.requestBody.content?.["application/json"]?.example || {}, null, 2)}
          </pre>
        </div>
      )}

      {/* Response Schema */}
      {successResponse && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">{t("api.response")} 200</h3>
          {successResponse.description && <p className="text-xs text-gray-400 mb-2">{successResponse.description}</p>}
          {responseExample && (
            <pre className="bg-gray-50 border rounded-lg p-3 text-xs font-mono text-gray-600 overflow-x-auto">
              {JSON.stringify(responseExample, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Try It */}
      <div className="border rounded-lg overflow-hidden">
        <button
          onClick={() => setTryOpen(!tryOpen)}
          className="w-full flex items-center gap-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        >
          {tryOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span className="text-sm font-medium text-gray-700">{t("api.tryIt")}</span>
        </button>

        {tryOpen && (
          <div className="p-4 border-t space-y-3">
            {/* Param inputs */}
            {allParams.length > 0 && (
              <div className="space-y-2">
                {allParams.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <label className="text-xs font-mono text-gray-500 w-28 flex-shrink-0">{p.name}</label>
                    <input
                      type="text"
                      value={paramValues[p.name] || ""}
                      onChange={(e) => setParamValues(prev => ({ ...prev, [p.name]: e.target.value }))}
                      placeholder={p.schema?.default?.toString() || p.schema?.type || ""}
                      className="flex-1 px-2 py-1.5 border rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Body input */}
            {hasBody && (
              <textarea
                value={bodyValue}
                onChange={(e) => setBodyValue(e.target.value)}
                placeholder='{ "key": "value" }'
                rows={5}
                className="w-full px-3 py-2 border rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-violet-500 resize-y"
              />
            )}

            {/* URL preview + Send */}
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] text-gray-400 truncate">{method} {buildUrl()}</code>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                <Send className="w-3 h-3" />
                {sending ? t("api.sending") : t("api.send")}
              </button>
            </div>

            {/* Response */}
            {response && (
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                      response.status >= 200 && response.status < 300 ? "bg-emerald-100 text-emerald-700" :
                      response.status >= 400 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                    }`}>
                      {response.status || "ERR"}
                    </span>
                    <span className="text-[11px] text-gray-400">{response.time}ms</span>
                  </div>
                  <button onClick={handleCopy} className="text-gray-400 hover:text-gray-600">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <pre className="p-3 text-xs font-mono text-gray-700 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
                  {response.body}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function schemaToExample(schema: any): any {
  if (!schema) return {};
  if (schema.example !== undefined) return schema.example;
  if (schema.type === "object" && schema.properties) {
    const obj: Record<string, any> = {};
    for (const [key, prop] of Object.entries(schema.properties) as [string, any][]) {
      obj[key] = schemaToExample(prop);
    }
    return obj;
  }
  if (schema.type === "array") return [schemaToExample(schema.items)];
  if (schema.type === "string") return "string";
  if (schema.type === "number" || schema.type === "integer") return 0;
  if (schema.type === "boolean") return false;
  return null;
}
