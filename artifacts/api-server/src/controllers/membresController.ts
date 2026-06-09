import { type Request, type Response } from "express";
import PDFDocument from "pdfkit";

import { db, membresTable, livraisonsTable, campagnesTable } from "@workspace/db";
import { eq, and, or, ilike, sql, desc, notInArray, asc } from "drizzle-orm";
import { CreateMembreBody, UpdateMembreBody } from "@workspace/api-zod";
import { computeCodeMembre } from "../services/portailService";
import { drawHeader, drawFooter } from "../services/pdfHeaderService";

function enrichMembre<T extends { id: number; dateAdhesion: string }>(m: T) {
  return { ...m, codeMembre: computeCodeMembre(m.id, m.dateAdhesion) };
}

export async function listMembres(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"))));
    const search = String(req.query["search"] ?? "").trim();
    const statut = req.query["statut"] as string | undefined;
    const offset = (page - 1) * limit;

    const conditions = [eq(membresTable.cooperativeId, cooperativeId)];
    if (statut === "actif" || statut === "inactif") conditions.push(eq(membresTable.statut, statut));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(membresTable.nom, pattern),
          ilike(membresTable.prenoms, pattern),
          ilike(membresTable.telephone, pattern),
          sql`coalesce(${membresTable.village}, '') ilike ${pattern}`,
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [membres, [{ count }]] = await Promise.all([
      db.select().from(membresTable).where(where).orderBy(desc(membresTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(membresTable).where(where),
    ]);

    res.json({ membres: membres.map(enrichMembre), total: count, page, limit });
  } catch (err) {
    req.log.error({ err }, "Erreur listMembres");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMembreById(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [membre] = await db.select().from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreById");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = CreateMembreBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const data = { ...parse.data, cooperativeId };

  if (!data.superficieHa || parseFloat(String(data.superficieHa)) <= 0) {
    res.status(400).json({ erreur: "La superficie doit être supérieure à 0" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(membresTable)
      .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.telephone, data.telephone)))
      .limit(1);

    if (existing) {
      res.status(400).json({ erreur: "Ce numéro de téléphone est déjà utilisé dans cette coopérative" });
      return;
    }

    const [membre] = await db
      .insert(membresTable)
      .values({
        ...data,
        dateAdhesion: data.dateAdhesion ?? new Date().toISOString().split("T")[0]!,
      })
      .returning();

    res.status(201).json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur createMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  const parse = UpdateMembreBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides" });
    return;
  }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [membre] = await db
      .update(membresTable)
      .set({ ...parse.data, updatedAt: new Date() })
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .returning();

    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur updateMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMembreByQr(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params["token"] ?? "");
    const [membre] = await db.select().from(membresTable).where(eq(membresTable.qrCodeToken, token)).limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreByQr");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMembreHistorique(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { avancesTable, livraisonsTable, paiementsTable } = await import("@workspace/db");
    const [membreCheck] = await db.select({ id: membresTable.id }).from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId))).limit(1);
    if (!membreCheck) { res.status(404).json({ erreur: "Membre introuvable" }); return; }

    const [livraisons, avances, paiements] = await Promise.all([
      db.select().from(livraisonsTable).where(eq(livraisonsTable.membreId, id)).orderBy(desc(livraisonsTable.dateLivraison)),
      db.select().from(avancesTable).where(eq(avancesTable.membreId, id)).orderBy(desc(avancesTable.dateOctroi)),
      db.select().from(paiementsTable).where(eq(paiementsTable.membreId, id)).orderBy(desc(paiementsTable.createdAt)),
    ]);

    res.json({ livraisons, avances, paiements });
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreHistorique");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function exportMembresPdf(req: Request, res: Response): Promise<void> {
  try {
    const statutFilter = req.query["statut"] as string | undefined;
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

    const conditions = [eq(membresTable.cooperativeId, cooperativeId)];
    if (statutFilter === "actif" || statutFilter === "inactif") {
      conditions.push(eq(membresTable.statut, statutFilter));
    }

    const membres = await db
      .select()
      .from(membresTable)
      .where(and(...conditions))
      .orderBy(asc(membresTable.nom));

    const label =
      statutFilter === "actif" ? "Membres actifs" :
      statutFilter === "inactif" ? "Membres inactifs" :
      "Tous les membres";

    const coopId = cooperativeId;
    const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
    const pdfChunks: Buffer[] = [];
    const pdfEndPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (c: Buffer) => pdfChunks.push(c));
      doc.on("end",  () => resolve(Buffer.concat(pdfChunks)));
      doc.on("error", reject);
    });

    const VERT = "#1a4731";
    const GRIS = "#6b7280";
    const NOIR = "#111827";

    await drawHeader(doc, coopId, {
      titre_document: "Liste des membres",
      reference: `${label} · ${new Date().toLocaleDateString("fr-FR")}`,
    });

    // Résumé
    const nbActifs = membres.filter((m) => m.statut === "actif").length;
    const nbInactifs = membres.filter((m) => m.statut === "inactif").length;
    doc.fontSize(10).font("Helvetica")
      .fillColor(GRIS)
      .text(`Total : ${membres.length} membres   |   Actifs : ${nbActifs}   |   Inactifs : ${nbInactifs}`, 50, doc.y);
    doc.moveDown(0.8);

    // En-têtes tableau
    const cols = { nom: 50, code: 200, tel: 285, village: 370, superficie: 450, statut: 510 };
    const rowH = 20;

    const drawTableHeader = () => {
      const headerY = doc.y;
      doc.rect(50, headerY, doc.page.width - 100, rowH).fill("#f0fdf4");
      const ty = headerY + 6;
      doc.fillColor(VERT).fontSize(8).font("Helvetica-Bold");
      doc.text("NOM & PRÉNOMS", cols.nom, ty, { width: 145, lineBreak: false });
      doc.text("CODE",          cols.code,      ty, { width: 80,  lineBreak: false });
      doc.text("TÉLÉPHONE",     cols.tel,        ty, { width: 80,  lineBreak: false });
      doc.text("VILLAGE",       cols.village,    ty, { width: 75,  lineBreak: false });
      doc.text("HA",            cols.superficie, ty, { width: 55,  lineBreak: false, align: "right" });
      doc.text("STATUT",        cols.statut,     ty, { width: 55,  lineBreak: false });
      doc.fillColor(NOIR);
      doc.y = headerY + rowH;
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke("#e5e7eb");
    };

    drawTableHeader();

    for (const [i, m] of membres.entries()) {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        drawTableHeader();
      }
      const rowY = doc.y;
      if (i % 2 === 0) {
        doc.rect(50, rowY, doc.page.width - 100, rowH).fill("#f9fafb");
      }
      const ty = rowY + 5;
      const code = computeCodeMembre(m.id, m.dateAdhesion);
      doc.fillColor(NOIR).fontSize(8).font("Helvetica");
      doc.text(`${m.nom} ${m.prenoms}`,            cols.nom,      ty, { width: 145, lineBreak: false });
      doc.fillColor(VERT).font("Helvetica-Bold");
      doc.text(code,                                cols.code,     ty, { width: 80,  lineBreak: false });
      doc.fillColor(NOIR).font("Helvetica");
      doc.text(m.telephone ?? "—",                  cols.tel,       ty, { width: 80,  lineBreak: false });
      doc.text(m.village   ?? "—",                  cols.village,   ty, { width: 75,  lineBreak: false });
      doc.text(parseFloat(m.superficieHa).toFixed(2), cols.superficie, ty, { width: 55, lineBreak: false, align: "right" });
      const statutColor = m.statut === "actif" ? "#16a34a" : "#6b7280";
      doc.fillColor(statutColor).font("Helvetica-Bold");
      doc.text(m.statut === "actif" ? "Actif" : "Inactif", cols.statut, ty, { width: 55, lineBreak: false });
      doc.fillColor(NOIR);
      doc.y = rowY + rowH;
    }

    const membresRange = doc.bufferedPageRange();
    for (let i = 0; i < membresRange.count; i++) {
      doc.switchToPage(i);
      await drawFooter(doc, coopId, i + 1, membresRange.count);
    }
    doc.end();
    const pdfBuf = await pdfEndPromise;

    const filename = `membres-${statutFilter ?? "tous"}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(pdfBuf.length));
    res.end(pdfBuf);
  } catch (err) {
    req.log.error({ err }, "Erreur exportMembresPdf");
    if (!res.headersSent) res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function modifierStatutMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { statut } = req.body as { statut: string };
    if (statut !== "actif" && statut !== "inactif") {
      res.status(400).json({ erreur: "Statut invalide (actif ou inactif attendu)" });
      return;
    }
    const [membre] = await db
      .update(membresTable)
      .set({ statut })
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .returning();
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur modifierStatutMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function desactiverMembresSansCampagne(req: Request, res: Response): Promise<void> {
  try {
    const campagneId = parseInt(String(req.params["id"] ?? "0"));
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

    const campagne = await db.query.campagnesTable.findFirst({
      where: and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)),
    });
    if (!campagne) {
      res.status(404).json({ erreur: "Campagne introuvable" });
      return;
    }

    const livraisons = await db
      .selectDistinct({ membreId: livraisonsTable.membreId })
      .from(livraisonsTable)
      .where(eq(livraisonsTable.campagneId, campagneId));

    const membresAvecLivraison = livraisons.map((l) => l.membreId).filter((id): id is number => id !== null);

    let desactivesCount = 0;
    const baseWhere = and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"));

    if (membresAvecLivraison.length > 0) {
      const updated = await db
        .update(membresTable)
        .set({ statut: "inactif" })
        .where(and(baseWhere, notInArray(membresTable.id, membresAvecLivraison)))
        .returning({ id: membresTable.id });
      desactivesCount = updated.length;
    } else {
      const updated = await db
        .update(membresTable)
        .set({ statut: "inactif" })
        .where(baseWhere)
        .returning({ id: membresTable.id });
      desactivesCount = updated.length;
    }

    res.json({ desactivesCount, campagneId });
  } catch (err) {
    req.log.error({ err }, "Erreur desactiverMembresSansCampagne");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
