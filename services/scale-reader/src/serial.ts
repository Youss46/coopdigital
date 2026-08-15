/**
 * serial.ts — Ouverture du port série et lecture des trames Yaohua A12E
 *
 * Reconnexion automatique toutes les RECONNECT_DELAY_MS si le port se ferme/plante.
 */

import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { EventEmitter } from "node:events";
import { parseLine } from "./parser.js";
import { log } from "./logger.js";

const RECONNECT_DELAY_MS = 3_000;

export interface SerialEvents {
  reading: (weightKg: number, rawLine: string) => void;
  connected: () => void;
  disconnected: (reason: string) => void;
}

export class ScaleSerialReader extends EventEmitter {
  private port: SerialPort | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly portPath: string) {
    super();
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.port?.close();
    this.port = null;
  }

  private connect() {
    if (this.stopped) return;

    log.info(`[serial] Tentative d'ouverture de ${this.portPath} (1200 8N1)…`);

    let sp: SerialPort;
    try {
      sp = new SerialPort({
        path: this.portPath,
        baudRate: 1200,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        autoOpen: false,
      });
    } catch (err) {
      log.error(`[serial] Impossible de créer le port : ${String(err)}`);
      this.scheduleReconnect();
      return;
    }

    // Parser ligne par ligne (délimiteur \n, compatible \r\n)
    const parser = sp.pipe(new ReadlineParser({ delimiter: "\n" }));

    sp.open((err) => {
      if (err) {
        log.warn(`[serial] Échec ouverture : ${err.message}`);
        this.scheduleReconnect();
        return;
      }
      log.info(`[serial] Port ${this.portPath} ouvert ✓`);
      this.port = sp;
      this.emit("connected");
    });

    parser.on("data", (line: string) => {
      const trimmed = line.replace(/\r/g, "").trim();
      log.debug(`[serial] TRAME : ${JSON.stringify(trimmed)}`);

      const weightKg = parseLine(trimmed);
      if (weightKg !== null) {
        log.debug(`[serial] Poids parsé : ${weightKg} kg`);
        this.emit("reading", weightKg, trimmed);
      } else {
        log.debug(`[serial] Trame ignorée (non parseable) : ${JSON.stringify(trimmed)}`);
      }
    });

    sp.on("close", () => {
      log.warn("[serial] Port fermé.");
      this.port = null;
      this.emit("disconnected", "Port fermé");
      this.scheduleReconnect();
    });

    sp.on("error", (err) => {
      log.error(`[serial] Erreur : ${err.message}`);
      this.port = null;
      this.emit("disconnected", err.message);
      sp.close(() => {/* ignore */});
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    if (this.reconnectTimer) return; // déjà planifié
    log.info(`[serial] Reconnexion dans ${RECONNECT_DELAY_MS / 1000}s…`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_DELAY_MS);
  }
}
