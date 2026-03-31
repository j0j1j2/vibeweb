import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Camera, RotateCcw, Tag, X, Rocket, History } from "lucide-react";
import { getSnapshots, createSnapshot, restoreSnapshot, addSnapshotTag, deleteSnapshotTag } from "@/api";

interface Snapshot {
  hash: string;
  message: string;
  created_at: string;
  tags: string[];
  is_deploy: boolean;
}

export function SnapshotsPage() {
  const { t } = useTranslation();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [restoringHash, setRestoringHash] = useState<string | null>(null);
  const [taggingHash, setTaggingHash] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const PAGE_SIZE = 50;

  const load = useCallback(async (offset = 0) => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await getSnapshots(tenantId, PAGE_SIZE, offset);
      const items = data.snapshots ?? [];
      if (offset === 0) setSnapshots(items);
      else setSnapshots((prev) => [...prev, ...items]);
      setHasMore(items.length === PAGE_SIZE);
    } catch {
      setError("Failed to load snapshots");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!tenantId) return;
    setCreating(true);
    setError(null);
    try {
      const data = await createSnapshot(tenantId, createMsg || "Manual snapshot");
      if (data.error) { setError(data.error === "No changes to snapshot" ? t("snapshots.noChanges") : t("snapshots.createFailed")); }
      else { setShowCreateDialog(false); setCreateMsg(""); load(); }
    } catch { setError(t("snapshots.createFailed")); }
    finally { setCreating(false); }
  };

  const handleRestore = async (hash: string) => {
    if (!tenantId || !confirm(t("snapshots.restoreConfirm"))) return;
    setRestoringHash(hash);
    try {
      await restoreSnapshot(tenantId, hash);
      load();
    } catch { setError(t("snapshots.restoreFailed")); }
    finally { setRestoringHash(null); }
  };

  const handleAddTag = async (hash: string) => {
    if (!tenantId || !tagInput.trim()) return;
    try {
      const data = await addSnapshotTag(tenantId, hash, tagInput.trim());
      if (data.error) { setError(t("snapshots.tagFailed")); return; }
      setTaggingHash(null);
      setTagInput("");
      load();
    } catch { setError(t("snapshots.tagFailed")); }
  };

  const handleDeleteTag = async (tag: string) => {
    if (!tenantId || !confirm(t("snapshots.deleteTagConfirm"))) return;
    try {
      await deleteSnapshotTag(tenantId, tag);
      load();
    } catch { /* ignore */ }
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("snapshots.title")}</h1>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 transition-colors"
        >
          <Camera className="w-4 h-4" /> {t("snapshots.create")}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {showCreateDialog && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <input
            type="text"
            value={createMsg}
            onChange={(e) => setCreateMsg(e.target.value)}
            placeholder={t("snapshots.messagePlaceholder")}
            className="w-full px-3 py-2 border rounded-lg text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-violet-500"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setShowCreateDialog(false); setCreateMsg(""); }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
              {t("common.cancel")}
            </button>
            <button onClick={handleCreate} disabled={creating} className="px-4 py-1.5 bg-violet-600 text-white text-sm rounded-lg hover:bg-violet-700 disabled:opacity-50">
              {creating ? "..." : t("snapshots.create")}
            </button>
          </div>
        </div>
      )}

      {snapshots.length > 0 ? (
        <div className="space-y-1">
          {snapshots.map((snap) => (
            <div key={snap.hash} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 group">
              <div className="mt-1 flex-shrink-0">
                {snap.is_deploy ? (
                  <Rocket className="w-4 h-4 text-orange-500" />
                ) : (
                  <div className="w-4 h-4 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-400">{snap.hash.slice(0, 7)}</span>
                  <span className="text-sm text-gray-700 truncate">{snap.message}</span>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-400">{timeAgo(snap.created_at)}</span>
                  {snap.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-600 text-xs rounded-full">
                      <Tag className="w-3 h-3" /> {tag}
                      <button onClick={() => handleDeleteTag(tag)} className="hover:text-violet-800"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                {taggingHash === snap.hash ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder={t("snapshots.tagPlaceholder")}
                      className="w-28 px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
                      onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(snap.hash); if (e.key === "Escape") { setTaggingHash(null); setTagInput(""); } }}
                      autoFocus
                    />
                    <button onClick={() => handleAddTag(snap.hash)} className="text-violet-600 hover:text-violet-800 text-xs font-medium">OK</button>
                  </div>
                ) : (
                  <button onClick={() => setTaggingHash(snap.hash)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100" title={t("snapshots.addTag")}>
                    <Tag className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleRestore(snap.hash)}
                  disabled={restoringHash === snap.hash}
                  className="p-1.5 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100 disabled:opacity-50"
                  title={t("snapshots.restore")}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
          {hasMore && (
            <button onClick={() => load(snapshots.length)} className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg">
              {t("snapshots.loadMore")}
            </button>
          )}
        </div>
      ) : !loading ? (
        <div className="text-center py-12 text-gray-400">
          <History className="w-8 h-8 mx-auto mb-2" />
          <p>{t("snapshots.noSnapshots")}</p>
          <p className="text-xs mt-1">{t("snapshots.noSnapshotsDesc")}</p>
        </div>
      ) : null}
    </div>
  );
}
