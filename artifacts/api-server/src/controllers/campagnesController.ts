import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { campagnesTable, bilansCampagneTable, membresTable, livraisonsTable } from "@workspace/db";
import { eq, and, desc, notInArray, sql } from "drizzle-orm";
import {
  verifierAvantCloture,
  genererBilan,
  cloturerCampagne as cloturerCampagneService,
  getComparaisonCampagnes,
} from "../services/campagneService";
import PDFDocument from "pdfkit";
import { drawHeader, drawFooter } from "../services/pdfHeaderService";

export async function getCampagneActive(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const campagne = await db.query.campagnesTable.findFirst({
    where: and(
      eq(campagnesTable.cooperativeId, cooperativeId),
      eq(campagnesTable.statut, "ouverte")
    ),
    orderBy: [desc(campagnesTable.anneeDebut)],
  });
  if (!campagne) return res.status(404).json({ erreur: "Aucune campagne active" });
  return res.json(campagne);
}

export async function listCampagnes(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const campagnes = await db.query.campagnesTable.findMany({
    where: eq(campagnesTable.cooperativeId, cooperativeId),
    orderBy: [desc(campagnesTable.anneeDebut)],
  });
  return res.json(campagnes);
}

export async function getCampagne(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const id = parseInt(String(req.params["id"] ?? "0"));
  const campagne = await db.query.campagnesTable.findFirst({
    where: and(eq(campagnesTable.id, id), eq(campagnesTable.cooperativeId, cooperativeId)),
  });
  if (!campagne) return res.status(404).json({ erreur: "Campagne introuvable" });
  return res.json(campagne);
}

export async function createCampagne(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const { libelle, anneeDebut, anneeFin, dateOuverture, dateFermeture, tonnageCibleKg } = req.body as {
    libelle: string;
    anneeDebut: number;
    anneeFin: number;
    dateOuverture: string;
    dateFermeture?: string | null;
    tonnageCibleKg?: string | null;
  };

  if (!libelle || !anneeDebut || !anneeFin || !dateOuverture) {
    return res.status(400).json({ erreur: "Données manquantes" });
  }

  const [campagne] = await db
    .insert(campagnesTable)
    .values({
      cooperativeId,
      libelle,
      anneeDebut,
      anneeFin,
      dateOuverture,
      dateFermeture: dateFermeture || null,
      tonnageCibleKg: tonnageCibleKg || null,
      statut: "ouverte",
    })
    .returning();

  return res.status(201).json(campagne);
}

export async function fermerCampagne(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const id = parseInt(String(req.params["id"] ?? "0"));
  const { dateFermeture } = req.body as { dateFermeture?: string };

  const [campagne] = await db
    .update(campagnesTable)
    .set({ statut: "fermee", dateFermeture: dateFermeture ?? new Date().toISOString().slice(0, 10) })
    .where(and(eq(campagnesTable.id, id), eq(campagnesTable.cooperativeId, cooperativeId)))
    .returning();

  if (!campagne) return res.status(404).json({ erreur: "Campagne introuvable" });

  // Auto-inactivation : membres sans aucune livraison sur cette campagne
  try {
    const livraisons = await db
      .selectDistinct({ membreId: livraisonsTable.membreId })
      .from(livraisonsTable)
      .where(eq(livraisonsTable.campagneId, id));

    const membresAvecLivraison = livraisons.map((l) => l.membreId).filter((mid): mid is number => mid !== null);
    const baseWhere = and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"));

    if (membresAvecLivraison.length > 0) {
      await db.update(membresTable).set({ statut: "inactif" })
        .where(and(baseWhere, notInArray(membresTable.id, membresAvecLivraison)));
    } else {
      await db.update(membresTable).set({ statut: "inactif" }).where(baseWhere);
    }
  } catch (err) {
    req.log.error({ err }, "Erreur auto-inactivation membres après fermeture campagne");
  }

  return res.json(campagne);
}

export async function verifierCampagne(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const id = parseInt(String(req.params["id"] ?? "0"));
  const campagne = await db.query.campagnesTable.findFirst({
    where: and(eq(campagnesTable.id, id), eq(campagnesTable.cooperativeId, cooperativeId)),
  });
  if (!campagne) return res.status(404).json({ erreur: "Campagne introuvable" });

  const result = await verifierAvantCloture(cooperativeId, id);
  return res.json(result);
}

export async function cloturerCampagne(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const id = parseInt(String(req.params["id"] ?? "0"));
  const userId = (req as Request & { user?: { id: number } }).user?.id ?? 0;

  const campagne = await db.query.campagnesTable.findFirst({
    where: and(eq(campagnesTable.id, id), eq(campagnesTable.cooperativeId, cooperativeId)),
  });
  if (!campagne) return res.status(404).json({ erreur: "Campagne introuvable" });
  if (campagne.statut === "fermee") return res.status(400).json({ erreur: "Campagne déjà clôturée" });

  const bilanData = await cloturerCampagneService(cooperativeId, id, userId);
  return res.json(bilanData);
}

export async function getBilan(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const id = parseInt(String(req.params["id"] ?? "0"));
  const campagne = await db.query.campagnesTable.findFirst({
    where: and(eq(campagnesTable.id, id), eq(campagnesTable.cooperativeId, cooperativeId)),
  });
  if (!campagne) return res.status(404).json({ erreur: "Campagne introuvable" });

  const bilan = await db.query.bilansCampagneTable.findFirst({
    where: eq(bilansCampagneTable.campagneId, id),
  });

  if (!bilan) {
    const bilanData = await genererBilan(cooperativeId, id);
    return res.json(bilanData);
  }

  return res.json({ campagne, bilan });
}

export async function getBilanPdf(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const id = parseInt(String(req.params["id"] ?? "0"));
  const campagne = await db.query.campagnesTable.findFirst({
    where: and(eq(campagnesTable.id, id), eq(campagnesTable.cooperativeId, cooperativeId)),
  });
  if (!campagne) return res.status(404).json({ erreur: "Campagne introuvable" });

  const { bilan } = await genererBilan(cooperativeId, id);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="bilan-campagne-${campagne.libelle.replace(/\s+/g, "-")}.pdf"`
  );

  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  const bilanChunks: Buffer[] = [];
  const bilanEndPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => bilanChunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(bilanChunks)));
    doc.on("error", reject);
  });

  const VERT  = "#16a34a";
  const GRIS  = "#6b7280";
  const NOIR  = "#111827";
  const ROUGE = "#dc2626";

  const fmt = (n: string | number | null | undefined) =>
    Number(n ?? 0).toLocaleString("fr-FR");
  const fmtPct = (n: string | number | null | undefined) => {
    const v = Number(n ?? 0);
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  };

  const header = async (pageLabel: string) => {
    await drawHeader(doc, cooperativeId, {
      titre_document: "Bilan de Campagne",
      reference: `${campagne.libelle} · ${pageLabel}`,
    });
  };

  const kpiGrid = (items: { label: string; valeur: string; sous?: string }[], cols = 3) => {
    const W = (doc.page.width - 100) / cols;
    let col = 0;
    const startX = 50;
    const startY = doc.y;
    items.forEach((item) => {
      const x = startX + col * W;
      doc.rect(x, startY, W - 8, 72).fillAndStroke("#f0fdf4", "#bbf7d0");
      doc.fillColor(VERT).fontSize(8).font("Helvetica-Bold")
        .text(item.label, x + 8, startY + 8, { width: W - 20 });
      doc.fillColor(NOIR).fontSize(14).font("Helvetica-Bold")
        .text(item.valeur, x + 8, startY + 24, { width: W - 20 });
      if (item.sous) {
        doc.fillColor(GRIS).fontSize(8).font("Helvetica")
          .text(item.sous, x + 8, startY + 50, { width: W - 20 });
      }
      col++;
      if (col >= cols) { col = 0; doc.y = startY + 82; }
    });
    if (col > 0) doc.y = startY + 82;
    doc.fillColor(NOIR);
  };

  const sectionTitle = (t: string) => {
    doc.moveDown(0.5);
    doc.fillColor(VERT).fontSize(13).font("Helvetica-Bold").text(t);
    doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).stroke(VERT);
    doc.moveDown(0.5).fillColor(NOIR);
  };

  await header("Page 1/5 — Résumé Exécutif");
  kpiGrid([
    { label: "TONNAGE COLLECTÉ", valeur: `${fmt(bilan.tonnageTotalKg)} kg`, sous: `${fmt(bilan.nbLivraisons)} livraisons` },
    { label: "CA VENTES", valeur: `${fmt(bilan.caVentesFcfa)} FCFA`, sous: `${fmt(bilan.nbExportateurs)} exportateurs` },
    { label: "MARGE NETTE", valeur: `${fmt(bilan.margeNetteFcfa)} FCFA`, sous: `${fmt(bilan.margeKgFcfa)} FCFA/kg` },
    { label: "MEMBRES ACTIFS", valeur: String(bilan.nbMembresActifs ?? 0), sous: "fournisseurs actifs" },
    { label: "PRIX ACHAT MOY.", valeur: `${fmt(bilan.prixAchatMoyenKgFcfa)} FCFA/kg` },
    { label: "PRIX VENTE MOY.", valeur: `${fmt(bilan.prixVenteMoyenKgFcfa)} FCFA/kg` },
  ]);

  if (bilan.variationTonnagePct != null) {
    sectionTitle("Évolution vs campagne précédente");
    doc.fontSize(10).font("Helvetica");
    const evols: [string, string | null | undefined][] = [
      ["Tonnage", bilan.variationTonnagePct],
      ["Chiffre d'affaires", bilan.variationCaPct],
      ["Marge nette", bilan.variationMargePct],
    ];
    evols.forEach(([label, val]) => {
      const v = Number(val ?? 0);
      doc.fillColor(v >= 0 ? VERT : ROUGE).text(`${label} : ${fmtPct(val)}`, { indent: 20 });
    });
    doc.fillColor(NOIR);
  }

  doc.addPage();
  await header("Page 2/5 — Production");
  sectionTitle("Tonnage par type de fournisseur");
  kpiGrid([
    { label: "MEMBRES", valeur: `${fmt(bilan.tonnageMembresKg)} kg` },
    { label: "PISTEURS", valeur: `${fmt(bilan.tonnagePisteursKg)} kg` },
    { label: "EXTERNES", valeur: `${fmt(bilan.tonnageExternesKg)} kg` },
  ]);
  sectionTitle("Indicateurs de production");
  doc.fontSize(10).font("Helvetica");
  doc.text(`Nombre de livraisons : ${fmt(bilan.nbLivraisons)}`);
  doc.text(`Membres actifs : ${fmt(bilan.nbMembresActifs)}`);
  doc.text(`Prix d'achat moyen : ${fmt(bilan.prixAchatMoyenKgFcfa)} FCFA/kg`);
  doc.text(`Coût total d'achat : ${fmt(bilan.coutAchatTotalFcfa)} FCFA`);

  doc.addPage();
  await header("Page 3/5 — Ventes & Financier");
  sectionTitle("Ventes aux exportateurs");
  kpiGrid([
    { label: "TONNAGE VENDU", valeur: `${fmt(bilan.tonnageVenduKg)} kg` },
    { label: "CA VENTES", valeur: `${fmt(bilan.caVentesFcfa)} FCFA` },
    { label: "CRÉANCES REST.", valeur: `${fmt(bilan.creancesRestantesFcfa)} FCFA` },
  ]);
  sectionTitle("Compte de résultat simplifié");
  const lignes: [string, string | null | undefined, boolean?][] = [
    ["Chiffre d'affaires ventes", bilan.caVentesFcfa],
    ["(-) Coût d'achat cacao", bilan.coutAchatTotalFcfa],
    ["= Marge brute", bilan.margeBruteFcfa, true],
    ["(-) Charges exploitation", bilan.chargesExploitationFcfa],
    ["(-) Charges personnel", bilan.chargesPersonnelFcfa],
    ["(-) Charges financières", bilan.chargesFinancieresFcfa],
    ["= Marge nette", bilan.margeNetteFcfa, true],
  ];
  lignes.forEach(([label, val, bold]) => {
    doc.fontSize(10)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(bold ? VERT : NOIR)
      .text(`${label} : ${fmt(val)} FCFA`, { indent: bold ? 0 : 20 });
  });
  doc.fillColor(NOIR);

  doc.addPage();
  await header("Page 4/5 — Avances & Social");
  sectionTitle("Avances membres");
  kpiGrid([
    { label: "OCTROYÉES", valeur: `${fmt(bilan.avancesOctroYeesFcfa)} FCFA` },
    { label: "REMBOURSÉES", valeur: `${fmt(bilan.avancesRembouRseesFcfa)} FCFA` },
    { label: "SOLDE RESTANT", valeur: `${fmt(bilan.avancesSoldeFcfa)} FCFA` },
  ]);
  sectionTitle("Intrants");
  kpiGrid([
    { label: "DISTRIBUÉS", valeur: `${fmt(bilan.intrantsDistribuEsFcfa)} FCFA` },
    { label: "RECOUVRÉS", valeur: `${fmt(bilan.intrantsRecouVresFcfa)} FCFA` },
  ]);
  sectionTitle("Vie sociale");
  kpiGrid([
    { label: "PARTS SOCIALES", valeur: `${fmt(bilan.partsSocialesCollecteesFcfa)} FCFA` },
    { label: "COTISATIONS", valeur: `${fmt(bilan.cotisationsCollecteesFcfa)} FCFA` },
  ]);

  doc.addPage();
  await header("Page 5/5 — Résolutions & Perspectives");
  sectionTitle("Résumé de la campagne");
  doc.fontSize(10).font("Helvetica").fillColor(NOIR);
  doc.text(`Campagne : ${campagne.libelle}`);
  doc.text(`Période : ${campagne.anneeDebut}–${campagne.anneeFin}`);
  doc.text(`Date d'ouverture : ${new Date(campagne.dateOuverture).toLocaleDateString("fr-FR")}`);
  if (campagne.dateFermeture) {
    doc.text(`Date de clôture : ${new Date(campagne.dateFermeture).toLocaleDateString("fr-FR")}`);
  }
  doc.moveDown();
  doc.text(`Bilan généré le : ${new Date(bilan.dateGeneration ?? Date.now()).toLocaleString("fr-FR")}`);

  const bilanRange = doc.bufferedPageRange();
  for (let i = 0; i < bilanRange.count; i++) {
    doc.switchToPage(i);
    await drawFooter(doc, cooperativeId, i + 1, bilanRange.count);
  }
  doc.end();
  const bilanBuffer = await bilanEndPromise;
  res.send(bilanBuffer);
  return;
}

export async function getComparaison(req: Request, res: Response) {
  const idsParam = String(req.query["ids"] ?? "");
  const ids = idsParam
    ? idsParam.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n))
    : [];

  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const result = await getComparaisonCampagnes(cooperativeId, ids);
  return res.json(result);
}

// POST /api/campagnes/:id/rattacher-livraisons
// Rattache toutes les livraisons sans campagne_id (membres de cette coopérative) à cette campagne.
// Permet de corriger les données historiques saisies avant l'application de la règle.
export async function rattacherLivraisons(req: Request, res: Response) {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  const campagneId = parseInt(String(req.params["id"]));
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "id invalide" }); return; }

  // Vérifier que la campagne appartient à la coopérative
  const [campagne] = await db.select({
    id:         campagnesTable.id,
    anneeDebut: campagnesTable.anneeDebut,
    anneeFin:   campagnesTable.anneeFin,
  })
    .from(campagnesTable)
    .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!campagne) { res.status(404).json({ erreur: "Campagne introuvable" }); return; }

  const dateDebut = `${campagne.anneeDebut}-01-01`;
  const dateFin   = `${campagne.anneeFin}-12-31`;

  // Rattacher :
  //   1. les livraisons sans campagne_id (NULL)
  //   2. les livraisons avec un campagne_id différent mais dont la date tombe dans l'année de la campagne
  const result = await db.execute(
    sql`UPDATE livraisons l
        SET campagne_id = ${campagneId}
        FROM membres m
        WHERE l.membre_id = m.id
          AND m.cooperative_id = ${cooperativeId}
          AND (
            l.campagne_id IS NULL
            OR (
              l.campagne_id != ${campagneId}
              AND l.date_livraison >= ${dateDebut}::date
              AND l.date_livraison <= ${dateFin}::date
            )
          )`
  );

  const count = (result as { rowCount?: number }).rowCount ?? 0;
  return res.json({ rattachées: count, campagneId });
}
