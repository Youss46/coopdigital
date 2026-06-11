import {
  db,
  membresTable,
  livraisonsTable,
  avancesTable,
  campagnesTable,
  distributionsIntrantsTable,
  intrantsTable,
  liberationsPartsTable,
  scoresMembreTable,
} from "@workspace/db";
import { eq, desc, and, sql, count } from "drizzle-orm";
import path from "path";
import fs from "fs";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { getConfig } from "./configService";

const DEFAULT_LOGO_PATH = path.join(process.cwd(), "public", "logo-192.png");


// ─── Code membre ─────────────────────────────────────────────────────────────

export function computeCodeMembre(id: number, dateAdhesion: string): string {
  const year = new Date(dateAdhesion).getFullYear();
  return `MBR-${year}-${String(id).padStart(4, "0")}`;
}

export function parseCodeMembre(code: string): number | null {
  const parts = code.trim().toUpperCase().split("-");
  if (parts.length !== 3 || parts[0] !== "MBR") return null;
  const id = parseInt(parts[2] ?? "", 10);
  return isNaN(id) ? null : id;
}

// ─── Rate limiting (in-memory, 5/h par téléphone) ────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(telephone: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const key = telephone.replace(/\s/g, "");
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 3600_000 });
    return { allowed: true };
  }
  if (entry.count >= 5) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  entry.count += 1;
  return { allowed: true };
}

export function resetRateLimit(telephone: string): void {
  rateLimitMap.delete(telephone.replace(/\s/g, ""));
}

// ─── Connexion ────────────────────────────────────────────────────────────────

export async function authentifierMembre(
  codeMembre: string,
  telephone: string
): Promise<typeof membresTable.$inferSelect> {
  const membreId = parseCodeMembre(codeMembre);
  if (!membreId) throw new Error("Format de code membre invalide (ex: MBR-2025-0001)");

  const [membre] = await db
    .select()
    .from(membresTable)
    .where(eq(membresTable.id, membreId));

  if (!membre) throw new Error("Membre introuvable");

  const telCanon = (t: string) => t.replace(/[\s\-().+]/g, "");
  if (telCanon(membre.telephone) !== telCanon(telephone)) {
    throw new Error("Code membre ou téléphone incorrect");
  }

  const computed = computeCodeMembre(membre.id, membre.dateAdhesion);
  if (computed.toUpperCase() !== codeMembre.trim().toUpperCase()) {
    throw new Error("Code membre incorrect");
  }

  return membre;
}

// ─── Profil ───────────────────────────────────────────────────────────────────

export async function getProfilMembre(membreId: number) {
  const [membre] = await db
    .select()
    .from(membresTable)
    .where(eq(membresTable.id, membreId));
  if (!membre) throw new Error("Membre introuvable");

  const [campagneActive] = await db
    .select({ id: campagnesTable.id, libelle: campagnesTable.libelle })
    .from(campagnesTable)
    .where(eq(campagnesTable.statut, "ouverte"))
    .limit(1);

  return {
    id: membre.id,
    codeMembre: computeCodeMembre(membre.id, membre.dateAdhesion),
    nom: membre.nom,
    prenoms: membre.prenoms,
    telephone: membre.telephone,
    village: membre.village,
    groupement: membre.groupement,
    dateAdhesion: membre.dateAdhesion,
    statut: membre.statut,
    photoUrl: membre.photoUrl ?? null,
    carteStatut: membre.carteStatut ?? "non_emise",
    campagneActive: campagneActive ?? null,
  };
}

// ─── Livraisons ───────────────────────────────────────────────────────────────

export async function getLivraisonsMembre(membreId: number) {
  const rows = await db
    .select({
      id: livraisonsTable.id,
      codeAchat: livraisonsTable.codeAchat,
      dateLivraison: livraisonsTable.dateLivraison,
      produit: livraisonsTable.produit,
      poidsKg: livraisonsTable.poidsKg,
      prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
      montantBrutFcfa: livraisonsTable.montantBrutFcfa,
      avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
      intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
      montantNetFcfa: livraisonsTable.montantNetFcfa,
      campagneId: livraisonsTable.campagneId,
      campagneLibelle: campagnesTable.libelle,
    })
    .from(livraisonsTable)
    .leftJoin(campagnesTable, eq(livraisonsTable.campagneId, campagnesTable.id))
    .where(eq(livraisonsTable.membreId, membreId))
    .orderBy(desc(livraisonsTable.dateLivraison));

  return rows;
}

// ─── Avances ──────────────────────────────────────────────────────────────────

export async function getAvancesMembre(membreId: number) {
  const rows = await db
    .select()
    .from(avancesTable)
    .where(eq(avancesTable.membreId, membreId))
    .orderBy(desc(avancesTable.dateOctroi));

  return rows.map(a => ({
    id: a.id,
    montantOctroyeFcfa: a.montantOctroyeFcfa,
    montantRembourseFcfa: a.montantRembourse_fcfa,
    soldeRestantFcfa: a.soldeRestantFcfa,
    dateOctroi: a.dateOctroi,
    dateEcheance: a.dateEcheance,
    motif: a.motif,
    statut: a.statut,
    pctRembourse: a.montantOctroyeFcfa > 0
      ? Math.round((a.montantRembourse_fcfa / a.montantOctroyeFcfa) * 100)
      : 0,
  }));
}

// ─── Intrants ─────────────────────────────────────────────────────────────────

export async function getIntrantsMembre(membreId: number) {
  const rows = await db
    .select({
      id: distributionsIntrantsTable.id,
      intrantId: distributionsIntrantsTable.intrantId,
      intrantLibelle: intrantsTable.nom,
      intrantUnite: intrantsTable.unite,
      dateDistribution: distributionsIntrantsTable.dateDistribution,
      quantite: distributionsIntrantsTable.quantite,
      montantFcfa: distributionsIntrantsTable.montantFcfa,
      montantMembreFcfa: distributionsIntrantsTable.montantMembreFcfa,
      montantRembourseFcfa: distributionsIntrantsTable.montantRembourse_fcfa,
      statutRemboursement: distributionsIntrantsTable.statutRemboursement,
    })
    .from(distributionsIntrantsTable)
    .leftJoin(intrantsTable, eq(distributionsIntrantsTable.intrantId, intrantsTable.id))
    .where(eq(distributionsIntrantsTable.membreId, membreId))
    .orderBy(desc(distributionsIntrantsTable.dateDistribution));

  return rows.map(r => ({
    ...r,
    soldeDuFcfa: Math.max(
      0,
      Number(r.montantMembreFcfa ?? 0) - Number(r.montantRembourseFcfa ?? 0)
    ),
  }));
}

// ─── Parts sociales ───────────────────────────────────────────────────────────

export async function getPartsSocialesMembre(membreId: number) {
  const [membre] = await db
    .select({
      nbrePartsSouscrites: membresTable.nbrePartsSouscrites,
      valeurNominalePartFcfa: membresTable.valeurNominalePartFcfa,
      totalSouscritFcfa: membresTable.totalSouscritFcfa,
      totalLibereFcfa: membresTable.totalLibereFcfa,
      resteALibererFcfa: membresTable.resteALibererFcfa,
    })
    .from(membresTable)
    .where(eq(membresTable.id, membreId));

  if (!membre) throw new Error("Membre introuvable");

  const versements = await db
    .select()
    .from(liberationsPartsTable)
    .where(eq(liberationsPartsTable.membreId, membreId))
    .orderBy(desc(liberationsPartsTable.dateVersement));

  return {
    nbrePartsSouscrites: membre.nbrePartsSouscrites,
    valeurNominaleFcfa: membre.valeurNominalePartFcfa,
    totalSouscritFcfa: membre.totalSouscritFcfa,
    totalLibereFcfa: membre.totalLibereFcfa,
    resteALibererFcfa: membre.resteALibererFcfa,
    pctLibere: membre.totalSouscritFcfa > 0
      ? Math.round((membre.totalLibereFcfa / membre.totalSouscritFcfa) * 100)
      : 0,
    historiqueVersements: versements.map(v => ({
      id: v.id,
      dateVersement: v.dateVersement,
      montantFcfa: v.montantFcfa,
      codeLiberation: v.codeLiberation,
    })),
  };
}

// ─── Score ────────────────────────────────────────────────────────────────────

export async function getScoreMembre(membreId: number) {
  const [score] = await db
    .select()
    .from(scoresMembreTable)
    .where(eq(scoresMembreTable.membreId, membreId))
    .orderBy(desc(scoresMembreTable.dateCalcul))
    .limit(1);

  if (!score) return null;

  const [{ total }] = await db
    .select({ total: count() })
    .from(scoresMembreTable)
    .where(eq(scoresMembreTable.campagneId, score.campagneId));

  return {
    scoreGlobal: Number(score.scoreGlobal ?? 0),
    niveau: score.niveau,
    rang: score.rang,
    totalMembres: total,
    dateCalcul: score.dateCalcul,
    details: {
      volume: Number(score.scoreVolume ?? 0),
      qualite: Number(score.scoreQualite ?? 0),
      regularite: Number(score.scoreRegularite ?? 0),
      remboursement: Number(score.scoreRemboursement ?? 0),
      fidelite: Number(score.scoreFidelite ?? 0),
      cotisation: Number(score.scoreCotisation ?? 0),
    },
  };
}

// ─── PDF reçu livraison ───────────────────────────────────────────────────────

export async function generateRecuLivraison(cooperativeId: number, membreId: number, livraisonId: number): Promise<Buffer> {
  const [liv] = await db
    .select({
      id: livraisonsTable.id,
      codeAchat: livraisonsTable.codeAchat,
      dateLivraison: livraisonsTable.dateLivraison,
      produit: livraisonsTable.produit,
      poidsKg: livraisonsTable.poidsKg,
      prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
      montantBrutFcfa: livraisonsTable.montantBrutFcfa,
      avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
      intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
      montantNetFcfa: livraisonsTable.montantNetFcfa,
      membreId: livraisonsTable.membreId,
      campagneLibelle: campagnesTable.libelle,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      dateAdhesion: membresTable.dateAdhesion,
    })
    .from(livraisonsTable)
    .leftJoin(campagnesTable, eq(livraisonsTable.campagneId, campagnesTable.id))
    .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
    .where(and(eq(livraisonsTable.id, livraisonId), eq(livraisonsTable.membreId, membreId)));

  if (!liv) throw new Error("Livraison introuvable");

  const coopConfig = await getConfig(cooperativeId);
  const coopNom = coopConfig?.nomComplet ?? "CoopDigital";

  const doc = new PDFDocument({ size: "A5", margin: 30 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  const fmtFCFA = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");
  const codeMembre = computeCodeMembre(liv.membreId, liv.dateAdhesion ?? "2025-01-01");

  const VERT = coopConfig?.couleurPrimaire || "#1a4731";
  const W = 419.53;

  doc.rect(0, 0, W, 45).fill(VERT);
  try {
    let logoBuffer: Buffer | null = null;
    if (coopConfig?.logoUrl) {
      try {
        const resp = await fetch(`http://localhost:80${coopConfig.logoUrl}`);
        if (resp.ok) logoBuffer = Buffer.from(await resp.arrayBuffer());
      } catch (_) { /* logo coop inaccessible, utiliser défaut */ }
    }
    doc.image(logoBuffer ?? fs.readFileSync(DEFAULT_LOGO_PATH), 10, 5, { width: 35, height: 35 });
  } catch (_) { /* logo facultatif */ }
  doc.fontSize(14).fillColor("white").font("Helvetica-Bold")
    .text(coopNom, 52, 10);
  doc.fontSize(9).fillColor("#d1fae5").font("Helvetica")
    .text("Reçu de livraison", 52, 28);
  doc.fillColor("black").moveDown(3);

  doc.fontSize(10).font("Helvetica-Bold").text("MEMBRE", 30, 60);
  doc.fontSize(9).font("Helvetica")
    .text(`${liv.membreNom} ${liv.membrePrenoms}`, 30, 74)
    .text(`Code : ${codeMembre}`, 30, 87)
    .text(`Campagne : ${liv.campagneLibelle ?? "—"}`, 30, 100);

  doc.moveTo(30, 118).lineTo(W - 30, 118).strokeColor("#e5e7eb").stroke();

  const rows: [string, string][] = [
    ["Date de livraison", fmtDate(liv.dateLivraison)],
    ["Référence", liv.codeAchat ?? `LIV-${liv.id}`],
    ["Produit", liv.produit ?? "Cacao"],
    ["Poids net (kg)", `${Number(liv.poidsKg).toLocaleString("fr-FR")} kg`],
    ["Prix unitaire", fmtFCFA(liv.prixUnitaireFcfa) + "/kg"],
    ["Montant brut", fmtFCFA(liv.montantBrutFcfa)],
    ["Avance déduite", fmtFCFA(liv.avanceDeduiteFcfa)],
    ["Intrants déduits", fmtFCFA(liv.intrantsDeduitsFcfa)],
  ];

  let y = 128;
  rows.forEach(([label, val], i) => {
    if (i % 2 === 0) doc.rect(30, y, W - 60, 16).fill("#f9fafb");
    doc.fontSize(9).fillColor("#6b7280").font("Helvetica").text(label, 35, y + 4);
    doc.fillColor("black").font("Helvetica-Bold").text(val, W / 2, y + 4, { align: "right", width: W / 2 - 35 });
    y += 16;
  });

  doc.rect(30, y, W - 60, 22).fill(VERT);
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
    .text("NET REÇU", 35, y + 5)
    .text(fmtFCFA(liv.montantNetFcfa), W / 2, y + 5, { align: "right", width: W / 2 - 35 });

  doc.fontSize(7).fillColor("#9ca3af").font("Helvetica")
    .text(`Généré le ${fmtDate(new Date().toISOString())} — CoopDigital`, 30, doc.page.height - 25, {
      width: W - 60, align: "center",
    });

  doc.end();
  return new Promise(resolve => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ─── PDF carte membre ─────────────────────────────────────────────────────────

// ─── Vérification publique d'une carte (sans auth) ───────────────────────────
export async function verifierMembrePublic(codeMembre: string): Promise<{
  nom: string; prenoms: string; coopNom: string; coopVille: string;
  statut: string; village: string | null; superficieHa: string | null;
  dateAdhesion: string; codeMembre: string;
} | null> {
  // Extraire l'id depuis le format MBR-AAAA-NNNN
  const match = codeMembre.match(/^MBR-\d{4}-(\d+)$/);
  if (!match) return null;
  const id = parseInt(match[1]!, 10);

  const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, id));
  if (!membre) return null;

  // Vérifier que le code calculé correspond bien
  const codeCalcule = computeCodeMembre(membre.id, membre.dateAdhesion);
  if (codeCalcule !== codeMembre) return null;

  const [coop] = await db
    .select({ nom: sql<string>`nom`, ville: sql<string>`ville` })
    .from(sql`cooperatives`)
    .where(sql`id = ${membre.cooperativeId}`)
    .limit(1);

  return {
    nom: membre.nom,
    prenoms: membre.prenoms ?? "",
    coopNom: (coop as Record<string, string> | undefined)?.nom ?? "CoopDigital",
    coopVille: (coop as Record<string, string> | undefined)?.ville ?? "",
    statut: membre.statut,
    village: membre.village ?? null,
    superficieHa: membre.superficieHa ?? null,
    dateAdhesion: membre.dateAdhesion,
    codeMembre,
  };
}

export async function generateCarteMembre(membreId: number): Promise<Buffer> {
  const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, membreId));
  if (!membre) throw new Error("Membre introuvable");
  if (membre.carteStatut === "suspendue") throw new Error("Cette carte a été suspendue par l'administration");

  const [coop] = await db
    .select({ nom: sql<string>`nom`, ville: sql<string>`ville` })
    .from(sql`cooperatives`)
    .where(sql`id = ${membre.cooperativeId}`)
    .limit(1);

  const codeMembre = computeCodeMembre(membre.id, membre.dateAdhesion);
  const carteNo = membre.carteNumero ?? `C-${new Date().getFullYear()}-${String(membre.id).padStart(6, "0")}`;

  // ── QR code (PNG buffer) ─────────────────────────────────────────────────
  const host = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim() || "localhost";
  const verifyUrl = host === "localhost"
    ? `http://localhost/portail/verifier/${codeMembre}`
    : `https://${host}/portail/verifier/${codeMembre}`;
  const qrBuffer: Buffer = await QRCode.toBuffer(verifyUrl, {
    type: "png",
    width: 140,
    margin: 1,
    color: { dark: "#1a4731", light: "#ffffff" },
  });

  // ── Photo buffer ─────────────────────────────────────────────────────────
  let photoBuffer: Buffer | null = null;
  if (membre.photoUrl) {
    try {
      if (membre.photoUrl.startsWith("data:image/")) {
        const b64 = membre.photoUrl.split(",")[1];
        if (b64) photoBuffer = Buffer.from(b64, "base64");
      } else {
        const r = await fetch(membre.photoUrl, { signal: AbortSignal.timeout(5000) });
        if (r.ok) photoBuffer = Buffer.from(await r.arrayBuffer());
      }
    } catch { /* ignore — afficher placeholder */ }
  }

  // ── Dimensions carte ─────────────────────────────────────────────────────
  // Coordonnées logiques inchangées — SCALE réduit la taille physique du PDF
  const SCALE = 0.72;
  const W = 420, H = 265; // espace logique de dessin
  const doc = new PDFDocument({ size: [Math.round(W * SCALE), Math.round(H * SCALE)], margin: 0, bufferPages: true });
  const chunks: Buffer[] = [];
  const endPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  // Toutes les coordonnées de dessin restent dans l'espace 420×265
  doc.scale(SCALE, SCALE);

  const VERT_DARK = "#0d2b1a";
  const VERT     = "#1a4731";
  const VERT_MED = "#166534";
  const OR       = "#c4962a";
  const BLANC    = "#ffffff";
  const VERT_PALE  = "#bbf7d0";
  const VERT_CLAIR = "#6ee7b7";

  // ── Fond principal ──
  doc.rect(0, 0, W, H).fill(VERT);

  // ── Cercles décoratifs (discrets) ──
  doc.save();
  doc.opacity(0.05);
  doc.circle(395, 20, 90).fill(BLANC);
  doc.circle(400, H - 10, 80).fill(BLANC);
  doc.circle(-15, H - 30, 70).fill(BLANC);
  doc.restore();

  // ── Bandeau supérieur ──
  doc.rect(0, 0, W, 55).fill(VERT_MED);

  // ── Ligne dorée ──
  doc.rect(0, 55, W, 3).fill(OR);

  // ── Titre & coop ──
  doc.fontSize(13).font("Helvetica-Bold").fillColor(BLANC)
    .text("CARTE DE MEMBRE", 14, 12, { characterSpacing: 1 });

  const coopNom   = (coop as Record<string, string> | undefined)?.nom  ?? "CoopDigital";
  const coopVille = (coop as Record<string, string> | undefined)?.ville ?? "Côte d'Ivoire";
  doc.fontSize(8.5).font("Helvetica").fillColor(VERT_PALE).text(coopNom.toUpperCase(), 14, 30);
  doc.fontSize(7).fillColor(VERT_CLAIR).text(coopVille, 14, 43);

  // ── Nom du membre ──
  const fullName = `${membre.nom} ${membre.prenoms ?? ""}`.trim();
  const displayName = fullName.length > 28 ? fullName.slice(0, 26) + "…" : fullName;
  doc.fontSize(15).font("Helvetica-Bold").fillColor(BLANC)
    .text(displayName, 14, 70, { width: 250 });

  // ── Code membre (doré) ──
  doc.fontSize(10).font("Helvetica-Bold").fillColor(OR).text(codeMembre, 14, 92);

  // ── Séparateur ──
  doc.moveTo(14, 108).lineTo(258, 108).lineWidth(0.5).strokeColor("#22c55e").stroke();

  // ── Informations ──
  const items: Array<[string, string]> = [
    ["Village",   membre.village   ?? "—"],
    ["Adhésion",  new Date(membre.dateAdhesion).toLocaleDateString("fr-FR")],
    ["Superficie", `${membre.superficieHa} ha`],
  ];
  if (membre.section) items.push(["Section", membre.section]);

  let iy = 114;
  for (const [label, value] of items) {
    doc.fontSize(6.5).font("Helvetica").fillColor(VERT_CLAIR).text(label.toUpperCase(), 14, iy);
    doc.fontSize(8.5).font("Helvetica-Bold").fillColor(VERT_PALE).text(value, 88, iy);
    iy += 16;
  }

  // ── Photo de profil ──
  const photoCX = 343, photoCY = 110, photoR = 48;
  doc.save();
  doc.circle(photoCX, photoCY, photoR).clip();
  if (photoBuffer) {
    try {
      doc.image(photoBuffer, photoCX - photoR, photoCY - photoR, { width: photoR * 2, height: photoR * 2 });
    } catch {
      doc.rect(photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2).fill("#1e5c39");
      doc.fontSize(26).fillColor("#4ade80").font("Helvetica-Bold")
        .text((membre.nom[0] ?? "?").toUpperCase(), photoCX - 14, photoCY - 18);
    }
  } else {
    doc.rect(photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2).fill("#1e5c39");
    doc.fontSize(26).fillColor("#4ade80").font("Helvetica-Bold")
      .text((membre.nom[0] ?? "?").toUpperCase(), photoCX - 14, photoCY - 18);
  }
  doc.restore();
  doc.circle(photoCX, photoCY, photoR).lineWidth(2.5).strokeColor(OR).stroke();

  // ── QR code ──
  const qrSize = 68;
  const qrX = W - 14 - qrSize, qrY = H - 14 - 38 - qrSize;
  doc.rect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6).fill(BLANC);
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  doc.fontSize(5.5).fillColor(VERT_CLAIR).font("Helvetica")
    .text("SCANNER", qrX - 3, qrY + qrSize + 4, { width: qrSize + 6, align: "center" });

  // ── Bandeau inférieur ──
  doc.rect(0, H - 38, W, 38).fill(VERT_DARK);

  const isActif = membre.statut === "actif";
  doc.fontSize(9).font("Helvetica-Bold").fillColor(isActif ? "#22c55e" : "#ef4444")
    .text(isActif ? "\u2022 ACTIF" : "\u2022 INACTIF", 14, H - 27);
  doc.fontSize(8).font("Helvetica").fillColor("#86efac").text(carteNo, 105, H - 27);
  doc.fontSize(6.5).fillColor(VERT_CLAIR)
    .text("CoopDigital — Système de gestion coopérative", 0, H - 14, { width: W, align: "center" });

  doc.end();
  const pdfBuffer = await endPromise;

  // Marquer la carte comme active (seulement si première génération)
  if (membre.carteStatut === "non_emise") {
    await db.update(membresTable).set({
      carteStatut: "active",
      carteGenereLe: new Date(),
      carteNumero: carteNo,
    }).where(eq(membresTable.id, membreId));
  }

  return pdfBuffer;
}
