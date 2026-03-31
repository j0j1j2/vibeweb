import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

export async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10_000 });
  return stdout.trim();
}

export async function ensureGitRepo(previewDir: string): Promise<void> {
  const gitDir = path.join(previewDir, ".git");
  if (fs.existsSync(gitDir)) return;
  await git(previewDir, ["init"]);
  await git(previewDir, ["config", "user.name", "vibeweb"]);
  await git(previewDir, ["config", "user.email", "vibeweb@local"]);
  const gitignorePath = path.join(previewDir, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, "node_modules/\n");
  }
  await git(previewDir, ["add", "-A"]);
  await git(previewDir, ["commit", "-m", "Initial commit", "--allow-empty"]);
}

export async function autoCommitIfDirty(previewDir: string, message: string): Promise<string | null> {
  await ensureGitRepo(previewDir);
  const status = await git(previewDir, ["status", "--porcelain"]);
  if (!status) return null;
  await git(previewDir, ["add", "-A"]);
  await git(previewDir, ["commit", "-m", message]);
  const hash = await git(previewDir, ["rev-parse", "HEAD"]);
  return hash;
}

export interface SnapshotInfo {
  hash: string;
  message: string;
  created_at: string;
  tags: string[];
  is_deploy: boolean;
}

export async function listSnapshots(previewDir: string, limit: number = 50, offset: number = 0): Promise<SnapshotInfo[]> {
  await ensureGitRepo(previewDir);
  const args = ["log", `--max-count=${limit}`, "--format=%H%n%s%n%aI", "--decorate=no"];
  if (offset > 0) args.push(`--skip=${offset}`);
  const raw = await git(previewDir, args);
  if (!raw) return [];

  // Get all tags and their commit hashes
  const tagMap: Record<string, string[]> = {};
  try {
    const tagOutput = await git(previewDir, ["tag", "--format=%(refname:short) %(objectname:short)", "-l"]);
    for (const line of tagOutput.split("\n").filter(Boolean)) {
      const spaceIdx = line.indexOf(" ");
      if (spaceIdx === -1) continue;
      const tag = line.slice(0, spaceIdx);
      const shortHash = line.slice(spaceIdx + 1);
      if (!tagMap[shortHash]) tagMap[shortHash] = [];
      tagMap[shortHash].push(tag);
    }
  } catch { /* no tags */ }

  const lines = raw.split("\n");
  const snapshots: SnapshotInfo[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const hash = lines[i];
    const message = lines[i + 1];
    const created_at = lines[i + 2];
    const shortHash = hash.slice(0, 7);
    const tags = tagMap[shortHash] ?? [];
    for (const [key, val] of Object.entries(tagMap)) {
      if (hash.startsWith(key) && key !== shortHash) {
        tags.push(...val);
      }
    }
    const is_deploy = message.startsWith("deploy-") || tags.some(t => t.startsWith("deploy-"));
    snapshots.push({ hash, message, created_at, tags: [...new Set(tags)], is_deploy });
  }
  return snapshots;
}
