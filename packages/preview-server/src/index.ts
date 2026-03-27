import Fastify from "fastify";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import http from "node:http";
import { PREVIEW_SERVER_PORT } from "@vibeweb/shared";
import { RoomManager } from "./rooms.js";
import { TenantWatcher } from "./watcher.js";
import { previewStaticRoutes } from "./static.js";

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const tenantsDir = path.join(DATA_DIR, "tenants");

const app = Fastify({ logger: true });
app.register(previewStaticRoutes, { tenantsDir });
app.get("/health", async () => ({ status: "ok" }));

const rooms = new RoomManager();
const watcher = new TenantWatcher(tenantsDir, rooms);

const start = async () => {
  await app.listen({ port: PREVIEW_SERVER_PORT, host: "0.0.0.0" });
  const server = app.server as http.Server;
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url ?? "", `http://localhost`);
    const tenantId = url.searchParams.get("tenant");
    if (!tenantId) { ws.close(4000, "missing tenant parameter"); return; }
    rooms.join(tenantId, ws);
    watcher.watch(tenantId);
    ws.on("close", () => { rooms.leave(tenantId, ws); });
  });
  app.log.info("Preview server with WebSocket ready");
};
start();
