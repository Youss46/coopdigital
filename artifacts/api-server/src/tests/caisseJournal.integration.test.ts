import { pool } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import zlib from "zlib";
import { genererRapportPdf, getJournal } from "../services/caisseService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("journal de caisse sur une période PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let caisseId: number;

  const dateDebut = "2026-08-28";
  const dateFin = "2026-08-30";

  function extractPdfText(buffer: Buffer): string {
    const text: string[] = [buffer.toString("latin1")];
    let position = 0;
    while (position < buffer.length) {
      let marker = buffer.indexOf(Buffer.from("stream\r\n"), position);
      let delimiterLength = 8;
      const unixMarker = buffer.indexOf(Buffer.from("stream\n"), position);
      if (marker === -1 || (unixMarker !== -1 && unixMarker < marker)) {
        marker = unixMarker;
        delimiterLength = 7;
      }
      if (marker === -1) break;
      const end = buffer.indexOf(Buffer.from("endstream"), marker + delimiterLength);
      if (end === -1) break;
      try {
        const stream = zlib.inflateSync(buffer.subarray(marker + delimiterLength, end)).toString("latin1");
        text.push(stream);
        text.push(stream.replace(/<([0-9A-Fa-f]{2,})>/g, (_match, hex: string) =>
          Buffer.from(hex, "hex").toString("latin1")));
      } catch {
        // Les flux non compressés sont déjà couverts par le contenu brut.
      }
      position = end + 9;
    }
    return text.join("");
  }

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`Journal période ${process.pid}`, "Test", "Test"],
    );
    cooperativeId = cooperative.rows[0].id;

    const caisse = await client.query(
      `INSERT INTO caisses (cooperative_id, nom, type_caisse)
       VALUES ($1, $2, 'centrale')
       RETURNING id`,
      [cooperativeId, `Caisse journal période ${process.pid}`],
    );
    caisseId = caisse.rows[0].id;

    await client.query(
      `INSERT INTO mouvements_caisse
        (caisse_id, cooperative_id, type, motif, montant_fcfa,
         date_operation, solde_apres_fcfa, reference_operation)
       VALUES
        ($1, $2, 'sortie', 'autre', 10, '2026-08-27', 990, $3),
        ($1, $2, 'entree', 'autre', 100, '2026-08-28', 1090, $4),
        ($1, $2, 'sortie', 'autre', 25, '2026-08-30', 1065, $5),
        ($1, $2, 'entree', 'autre', 500, '2026-08-31', 1565, $6)`,
      [
        caisseId,
        cooperativeId,
        `PERIODE-AVANT-${process.pid}`,
        `PERIODE-DEBUT-${process.pid}`,
        `PERIODE-FIN-${process.pid}`,
        `PERIODE-APRES-${process.pid}`,
      ],
    );
  });

  afterAll(async () => {
    if (caisseId) {
      await client.query(`DELETE FROM mouvements_caisse WHERE caisse_id = $1`, [caisseId]);
      await client.query(`DELETE FROM caisses WHERE id = $1`, [caisseId]);
    }
    if (cooperativeId) {
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
    }
    client?.release();
  });

  it("inclut les deux bornes et additionne toute la période", async () => {
    const journal = await getJournal(caisseId, { dateDebut, dateFin });

    expect(journal.mouvements.map((m) => m.date_operation)).toEqual([
      dateDebut,
      dateFin,
    ]);
    expect(journal.totalEntrees).toBe(100);
    expect(journal.totalSorties).toBe(25);
  });

  it("inclut les mouvements et totaux des deux bornes dans le PDF", async () => {
    const pdf = await genererRapportPdf(caisseId, { dateDebut, dateFin });
    const text = extractPdfText(pdf);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(text).toContain(dateDebut);
    expect(text).toContain(dateFin);
    expect(text).toContain("100 FCFA");
    expect(text).toContain("25 FCFA");
  });

  it("refuse une période inversée avant toute requête SQL", async () => {
    await expect(
      getJournal(caisseId, { dateDebut: dateFin, dateFin: dateDebut }),
    ).rejects.toThrow("La date de fin doit être postérieure ou égale à la date de début.");
  });
});