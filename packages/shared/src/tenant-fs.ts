import fs from "node:fs";
import path from "node:path";

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
</head>
<body>
  <h1>Welcome to your site!</h1>
  <p>Start editing to make it yours.</p>
</body>
</html>`;

export function initTenantDir(paths: TenantPaths): void {
  fs.mkdirSync(paths.public, { recursive: true });
  fs.mkdirSync(path.join(paths.functions, "api"), { recursive: true });
  fs.mkdirSync(paths.db, { recursive: true });
  fs.mkdirSync(paths.previewPublic, { recursive: true });
  fs.mkdirSync(paths.previewFunctions, { recursive: true });
  fs.writeFileSync(path.join(paths.public, "index.html"), DEFAULT_INDEX_HTML);

  // Initialize empty tenant SQLite database
  const dbPath = path.join(paths.db, "tenant.db");
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, "");
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
