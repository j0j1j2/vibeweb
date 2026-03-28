import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";

interface FileRoutesOpts { tenantsDir: string; }
interface FileEntry { path: string; size: number; isDirectory: boolean; }

export async function fileRoutes(app: FastifyInstance, opts: FileRoutesOpts): Promise<void> {
  const { tenantsDir } = opts;

  app.get<{ Params: { id: string } }>("/tenants/:id/files", async (req, reply) => {
    const previewDir = path.join(tenantsDir, req.params.id, "preview");
    if (!fs.existsSync(previewDir)) return reply.status(404).send({ error: "tenant not found" });
    const files: FileEntry[] = [];
    walkDir(previewDir, previewDir, files);
    return { files };
  });

  app.get<{ Params: { id: string; "*": string } }>("/tenants/:id/files/*", async (req, reply) => {
    const filePath = req.params["*"];
    const fullPath = path.join(tenantsDir, req.params.id, "preview", filePath);
    const resolved = path.resolve(fullPath);
    const base = path.resolve(path.join(tenantsDir, req.params.id, "preview"));
    if (!resolved.startsWith(base)) return reply.status(403).send({ error: "forbidden" });
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) return reply.status(404).send({ error: "file not found" });
    const content = fs.readFileSync(fullPath, "utf-8");
    reply.type("text/plain").send(content);
  });

  app.put<{ Params: { id: string; "*": string }; Body: { content: string } }>("/tenants/:id/files/*", async (req, reply) => {
    const filePath = req.params["*"];
    const fullPath = path.join(tenantsDir, req.params.id, "preview", filePath);

    const resolved = path.resolve(fullPath);
    const base = path.resolve(path.join(tenantsDir, req.params.id, "preview"));
    if (!resolved.startsWith(base)) return reply.status(403).send({ error: "forbidden" });

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    const { content } = req.body;
    fs.writeFileSync(fullPath, content, "utf-8");

    return { success: true, path: filePath };
  });

  app.delete<{ Params: { id: string; "*": string } }>("/tenants/:id/files/*", async (req, reply) => {
    const filePath = req.params["*"];
    const fullPath = path.join(tenantsDir, req.params.id, "preview", filePath);

    const resolved = path.resolve(fullPath);
    const base = path.resolve(path.join(tenantsDir, req.params.id, "preview"));
    if (!resolved.startsWith(base)) return reply.status(403).send({ error: "forbidden" });

    if (!fs.existsSync(fullPath)) return reply.status(404).send({ error: "file not found" });

    fs.unlinkSync(fullPath);
    return { success: true };
  });
}

function walkDir(dir: string, baseDir: string, result: FileEntry[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === "CLAUDE.md") continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) { walkDir(fullPath, baseDir, result); }
    else { const stat = fs.statSync(fullPath); result.push({ path: relPath, size: stat.size, isDirectory: false }); }
  }
}
