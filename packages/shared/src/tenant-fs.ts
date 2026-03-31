import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export interface TenantPaths {
  root: string;
  public: string;
  functions: string;
  db: string;
  preview: string;
  previewPublic: string;
  previewFunctions: string;
}

export function getTenantPaths(baseDir: string, tenantId: string): TenantPaths {
  const root = path.join(baseDir, tenantId);
  return {
    root,
    public: path.join(root, "public"),
    functions: path.join(root, "functions"),
    db: path.join(root, "db"),
    preview: path.join(root, "preview"),
    previewPublic: path.join(root, "preview", "public"),
    previewFunctions: path.join(root, "preview", "functions"),
  };
}

const DEFAULT_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Site</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #fafafa; color: #111; min-height: 100vh; display: flex; flex-direction: column; }
    .hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; text-align: center; }
    .hero h1 { font-size: 3rem; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 0.5rem; background: linear-gradient(135deg, #7c3aed, #4f46e5); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .hero p { font-size: 1.125rem; color: #666; max-width: 480px; line-height: 1.6; }
    .badge { display: inline-flex; align-items: center; gap: 0.5rem; margin-top: 2rem; padding: 0.5rem 1rem; background: white; border: 1px solid #e5e7eb; border-radius: 999px; font-size: 0.875rem; color: #888; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .badge .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
  </style>
</head>
<body>
  <div class="hero">
    <h1>Hello, World</h1>
    <p>Your site is live. Open the chat panel and describe what you want to build.</p>
    <div class="badge"><span class="dot"></span> Powered by VibeWeb</div>
  </div>
</body>
</html>`;

export function initTenantDir(paths: TenantPaths): void {
  fs.mkdirSync(paths.public, { recursive: true });
  fs.mkdirSync(path.join(paths.functions, "api"), { recursive: true });
  fs.mkdirSync(paths.db, { recursive: true });
  fs.mkdirSync(paths.previewPublic, { recursive: true });
  fs.mkdirSync(paths.previewFunctions, { recursive: true });
  fs.writeFileSync(path.join(paths.public, "index.html"), DEFAULT_INDEX_HTML);
  fs.writeFileSync(path.join(paths.previewPublic, "index.html"), DEFAULT_INDEX_HTML);

  // Initialize empty tenant SQLite database
  const dbPath = path.join(paths.db, "tenant.db");
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, "");
  }

  // Initialize git repo in preview directory
  try {
    execFileSync("git", ["init"], { cwd: paths.preview });
    execFileSync("git", ["config", "user.name", "vibeweb"], { cwd: paths.preview });
    execFileSync("git", ["config", "user.email", "vibeweb@local"], { cwd: paths.preview });
    fs.writeFileSync(path.join(paths.preview, ".gitignore"), "node_modules/\n");
    execFileSync("git", ["add", "-A"], { cwd: paths.preview });
    execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: paths.preview });
  } catch {
    // git may not be available in all environments
  }
}

export function atomicDeploy(paths: TenantPaths): string | null {
  let backupPath: string | null = null;

  if (fs.existsSync(paths.public) && fs.readdirSync(paths.public).length > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = path.join(paths.root, `backup-${timestamp}`);
    fs.mkdirSync(path.join(backupPath, "public"), { recursive: true });
    fs.mkdirSync(path.join(backupPath, "functions"), { recursive: true });
    copyDirSync(paths.public, path.join(backupPath, "public"));
    copyDirSync(paths.functions, path.join(backupPath, "functions"));
  }

  if (fs.existsSync(paths.previewPublic)) {
    clearDirSync(paths.public);
    copyDirSync(paths.previewPublic, paths.public);
  }
  if (fs.existsSync(paths.previewFunctions)) {
    clearDirSync(paths.functions);
    copyDirSync(paths.previewFunctions, paths.functions);
  }

  return backupPath;
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function clearDirSync(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fs.rmSync(entryPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(entryPath);
    }
  }
}
