/**
 * server.ts — Serveur WebSocket (push temps réel) + HTTP (fallback GET)
 *
 * WebSocket port 4001 : push de ScaleState à chaque changement d'état
 * HTTP     port 4002 : GET /api/scale/current-weight → ScaleState JSON
 *
 * Le frontend React se connecte en ws://localhost:4001
 * avec un fallback polling sur http://localhost:4002/api/scale/current-weight
 */

import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import type { ScaleState } from "./types.js";
import { log } from "./logger.js";

export class ScaleServer {
  private wss: WebSocketServer;
  private state: ScaleState = {
    weightKg: null,
    isStable: false,
    isConnected: false,
    updatedAt: new Date().toISOString(),
    error: null,
  };

  constructor(wsPort: number, httpPort: number) {
    // ── WebSocket ────────────────────────────────────────────────
    this.wss = new WebSocketServer({ port: wsPort });

    this.wss.on("listening", () => {
      log.info(`[ws] WebSocket en écoute sur ws://localhost:${wsPort}`);
    });

    this.wss.on("connection", (ws) => {
      log.info(`[ws] Nouveau client connecté (${this.wss.clients.size} total)`);
      // Envoyer l'état actuel immédiatement au nouveau client
      this.send(ws, this.state);

      ws.on("close", () => {
        log.info(`[ws] Client déconnecté (${this.wss.clients.size} restant)`);
      });
    });

    // ── HTTP ─────────────────────────────────────────────────────
    const app = express();

    app.use((_req, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      next();
    });

    app.get("/api/scale/current-weight", (_req, res) => {
      res.json(this.state);
    });

    app.listen(httpPort, "127.0.0.1", () => {
      log.info(`[http] HTTP en écoute sur http://localhost:${httpPort}`);
    });
  }

  /** Met à jour l'état et le diffuse à tous les clients WebSocket */
  publish(patch: Partial<ScaleState>) {
    this.state = {
      ...this.state,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.broadcast(this.state);
  }

  private broadcast(state: ScaleState) {
    const msg = JSON.stringify(state);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        this.send(client, state);
      }
    }
    void msg; // silence lint unused
  }

  private send(ws: WebSocket, state: ScaleState) {
    try {
      ws.send(JSON.stringify(state));
    } catch {
      /* client déconnecté entre-temps */
    }
  }
}
