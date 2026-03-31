import type { FastifyInstance } from "fastify";
import path from "node:path";
import fs from "node:fs";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
};

interface PreviewStaticOpts { tenantsDir: string; }

export async function previewStaticRoutes(app: FastifyInstance, opts: PreviewStaticOpts): Promise<void> {
  const { tenantsDir } = opts;

  app.get<{ Params: { "*": string } }>("/*", async (req, reply) => {
    const tenantId = req.headers["x-tenant-id"] as string | undefined;
    if (!tenantId) return reply.status(400).send({ error: "missing x-tenant-id header" });

    let filePath = req.url.split("?")[0];
    if (filePath === "/" || filePath === "") filePath = "/index.html";

    const previewPublic = path.join(tenantsDir, tenantId, "preview", "public");
    const fullPath = path.resolve(path.join(previewPublic, filePath));

    if (!fullPath.startsWith(path.resolve(previewPublic))) return reply.status(403).send({ error: "Forbidden" });

    // Try exact file, then with .html extension, then index.html fallback
    let resolvedPath = fullPath;
    if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) {
      const withHtml = fullPath + ".html";
      if (fs.existsSync(withHtml) && !fs.statSync(withHtml).isDirectory()) {
        resolvedPath = withHtml;
      } else {
        // SPA-style fallback to index.html
        const indexFallback = path.join(previewPublic, "index.html");
        if (fs.existsSync(indexFallback)) {
          resolvedPath = indexFallback;
        } else {
          return reply.status(404).send({ error: "Not found" });
        }
      }
    }

    const ext = path.extname(resolvedPath);
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    reply.header("content-type", contentType);
    return reply.send(fs.readFileSync(resolvedPath));
  });
}
