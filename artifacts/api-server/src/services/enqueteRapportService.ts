import PDFDocument from "pdfkit";
import { db, missionsEnqueteTable, enqueteMembresTable, membresTable, usersTable, certificationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { drawHeader, drawFooter } from "./pdfHeaderService.js";
import { CRITERES_PAR_TYPE } from "./certificationService.js";
import type { ReponsesCriteres } from "./missionsEnqueteService.js";

// ─── Constantes mise en page ──────────────────────────────────────────────────

const ML = 40;   // margin left
const MR = 40;   // margin right
const W  = 515;  // content width (A4 595 - 80)

// ─── Helpers couleur ──────────────────────────────────────────────────────────

const STATUT_COLORS: Record<string, string> = {
  certifie:     "#16a34a",
  en_cours:     "#d97706",
  non_conforme: "#dc2626",
  collecte:     "#2563eb",
  valide:       "#16a34a",
  planifiee:    "#6b7280",
  en_attente:   "#6b7280",
};

const CERT_TYPE_LABELS: Record<string, string> = {
  rainforest_alliance: "Rainforest Alliance",
  fairtrade:           "Fairtrade",
  bio:                 "Biologique",
  eudr:                "EUDR",
  utz:                 "UTZ",
  autre:               "Autre",
};

const STATUT_LABELS: Record<string, string> = {
  certifie:     "Certifié",
  en_cours:     "En cours",
  non_conforme: "Non conforme",
  collecte:     "Collecté",
  valide:       "Validé",
  planifiee:    "Planifiée",
  en_cours_m:   "En cours",
  soumise:      "Soumise",
  validee:      "Validée",
  en_attente:   "En attente",
};

function couleurStatut(statut: string): string {
  return STATUT_COLORS[statut] ?? "#6b7280";
}

function badge(doc: InstanceType<typeof PDFDocument>, x: number, y: number, label: string, couleur: string) {
  const w = doc.fontSize(7).widthOfString(label) + 10;
  doc.save()
    .roundedRect(x, y - 1, w, 13, 3)
    .fill(couleur + "22")
    .restore();
  doc.font("Helvetica-Bold").fontSize(7).fillColor(couleur).text(label, x + 5, y + 1, { lineBreak: false });
  return w;
}

function sectionTitle(doc: InstanceType<typeof PDFDocument>, text: string, couleur: string) {
  doc.save()
    .rect(ML, doc.y, W, 18)
    .fill(couleur + "18")
    .restore();
  doc.font("Helvetica-Bold").fontSize(9).fillColor(couleur)
    .text(text.toUpperCase(), ML + 8, doc.y + 4, { width: W - 16, lineBreak: false });
  doc.y += 22;
}

function hline(doc: InstanceType<typeof PDFDocument>, couleur = "#e5e7eb") {
  doc.moveTo(ML, doc.y)
    .lineTo(ML + W, doc.y)
    .strokeColor(couleur).lineWidth(0.5).stroke();
  doc.y += 6;
}

// ─── Données ──────────────────────────────────────────────────────────────────

async function fetchMissionData(cooperativeId: number, missionId: number) {
  const [mission] = await db
    .select({
      id:              missionsEnqueteTable.id,
      titre:           missionsEnqueteTable.titre,
      certificationId: missionsEnqueteTable.certificationId,
      datePrevue:      missionsEnqueteTable.datePrevue,
      statut:          missionsEnqueteTable.statut,
      objectifMembres: missionsEnqueteTable.objectifMembres,
      instructions:    missionsEnqueteTable.instructions,
      createdAt:       missionsEnqueteTable.createdAt,
      agentNom:        usersTable.nom,
      agentPrenoms:    usersTable.prenoms,
    })
    .from(missionsEnqueteTable)
    .leftJoin(usersTable, eq(usersTable.id, missionsEnqueteTable.agentId))
    .where(and(
      eq(missionsEnqueteTable.id, missionId),
      eq(missionsEnqueteTable.cooperativeId, cooperativeId),
    ));

  if (!mission) return null;

  const [certif] = await db
    .select({ type: certificationsTable.type, nomCertificateur: certificationsTable.nomCertificateur })
    .from(certificationsTable)
    .where(eq(certificationsTable.id, mission.certificationId));

  const membres = await db
    .select({
      id:               enqueteMembresTable.id,
      membreId:         enqueteMembresTable.membreId,
      statut:           enqueteMembresTable.statut,
      reponses:         enqueteMembresTable.reponses,
      scoreCalcule:     enqueteMembresTable.scoreCalcule,
      statutConformite: enqueteMembresTable.statutConformite,
      notesAgent:       enqueteMembresTable.notesAgent,
      dateCollecte:     enqueteMembresTable.dateCollecte,
      nom:              membresTable.nom,
      prenoms:          membresTable.prenoms,
      code:             membresTable.carteProducteur,
      village:          membresTable.village,
    })
    .from(enqueteMembresTable)
    .innerJoin(membresTable, and(
      eq(membresTable.id, enqueteMembresTable.membreId),
      eq(membresTable.cooperativeId, cooperativeId),
    ))
    .where(eq(enqueteMembresTable.missionId, missionId))
    .orderBy(enqueteMembresTable.id);

  return { mission, certif: certif ?? null, membres };
}

// ─── Génération PDF ───────────────────────────────────────────────────────────

export async function generateRapportEnquete(
  cooperativeId: number,
  missionId: number,
): Promise<Buffer | null> {
  const data = await fetchMissionData(cooperativeId, missionId);
  if (!data) return null;

  const { mission, certif, membres } = data;
  const certType    = certif?.type ?? "autre";
  const criteres    = CRITERES_PAR_TYPE[certType] ?? [];
  const certLabel   = CERT_TYPE_LABELS[certType] ?? certType;
  const totalM      = membres.length;
  const collectes   = membres.filter(m => ["collecte", "valide"].includes(m.statut ?? "")).length;
  const valides     = membres.filter(m => m.statut === "valide").length;
  const conformes   = membres.filter(m => m.statutConformite === "certifie").length;
  const enCours     = membres.filter(m => m.statutConformite === "en_cours").length;
  const nonConf     = membres.filter(m => m.statutConformite === "non_conforme").length;

  // Pages estimées : 1 couverture + 1 par tranche de 8 membres
  const totalPages = 1 + Math.ceil(totalM / 6) || 1;
  let   pageNum    = 1;

  const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  // ── Page 1 : en-tête + résumé mission ──────────────────────────────────────
  doc.addPage();
  await drawHeader(doc, cooperativeId, {
    titre_document: "RAPPORT D'ENQUÊTE",
    reference:      `Mission #${missionId}`,
    hauteur_reservee: 100,
  });

  // Config couleur primary
  const couleur = "#1a4731";

  // ── Titre mission ──────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(14).fillColor(couleur)
    .text(mission.titre, ML, doc.y, { width: W });
  doc.y += 4;

  // Certification badge
  const bx = ML;
  badge(doc, bx, doc.y, certLabel, couleur);
  doc.y += 18;
  hline(doc);

  // ── Bloc infos mission (2 colonnes) ───────────────────────────────────────
  sectionTitle(doc, "Informations de la mission", couleur);
  const col1X = ML;
  const col2X = ML + W / 2;
  const rowH  = 16;
  const startY = doc.y;

  function infoRow(label: string, value: string, col: 1 | 2, row: number) {
    const x = col === 1 ? col1X : col2X;
    const y = startY + row * rowH;
    doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
      .text(label, x, y, { width: W / 2 - 10, lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827")
      .text(value, x + 110, y, { width: W / 2 - 120, lineBreak: false });
  }

  const agentLabel = mission.agentNom
    ? `${mission.agentPrenoms ?? ""} ${mission.agentNom}`.trim()
    : "Non assigné";
  const dateP = mission.datePrevue
    ? new Date(mission.datePrevue).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const dateC = mission.createdAt
    ? new Date(mission.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";

  infoRow("Type de certification :", certLabel,   1, 0);
  infoRow("Organisme certificateur :", certif?.nomCertificateur ?? "—", 1, 1);
  infoRow("Date prévue :", dateP, 1, 2);
  infoRow("Date de création :", dateC, 1, 3);
  infoRow("Agent terrain :", agentLabel, 2, 0);
  infoRow("Statut mission :", STATUT_LABELS[mission.statut ?? ""] ?? mission.statut ?? "—", 2, 1);
  infoRow("Membres ciblés :", String(mission.objectifMembres ?? totalM), 2, 2);

  doc.y = startY + 5 * rowH + 12;
  hline(doc);

  // ── Bloc résumé chiffres ───────────────────────────────────────────────────
  sectionTitle(doc, "Résumé de la collecte", couleur);

  const statBoxW = W / 5;
  const statBoxH = 46;
  const statY    = doc.y;

  function statBox(label: string, value: string | number, clr: string, idx: number) {
    const bxX = ML + idx * statBoxW;
    doc.save().roundedRect(bxX + 2, statY, statBoxW - 4, statBoxH, 4).fill(clr + "18").restore();
    doc.font("Helvetica-Bold").fontSize(20).fillColor(clr)
      .text(String(value), bxX + 2, statY + 4, { width: statBoxW - 4, align: "center", lineBreak: false });
    doc.font("Helvetica").fontSize(7).fillColor("#374151")
      .text(label, bxX + 2, statY + 30, { width: statBoxW - 4, align: "center", lineBreak: false });
  }

  statBox("Total membres", totalM,    couleur,    0);
  statBox("Collectés",     collectes, "#2563eb",  1);
  statBox("Validés",       valides,   "#16a34a",  2);
  statBox("Certifiés",     conformes, "#16a34a",  3);
  statBox("Non conformes", nonConf,   "#dc2626",  4);

  doc.y = statY + statBoxH + 14;
  hline(doc);

  // Instructions
  if (mission.instructions) {
    sectionTitle(doc, "Instructions", couleur);
    doc.font("Helvetica").fontSize(8).fillColor("#374151")
      .text(mission.instructions, ML, doc.y, { width: W });
    doc.y += 10;
    hline(doc);
  }

  // ── Tableau des membres ────────────────────────────────────────────────────
  sectionTitle(doc, `Résultats par membre (${totalM})`, couleur);

  // Entête colonnes tableau
  const COL = {
    num:    { x: ML,       w: 22  },
    nom:    { x: ML + 22,  w: 120 },
    code:   { x: ML + 142, w: 65  },
    village:{ x: ML + 207, w: 70  },
    score:  { x: ML + 277, w: 40  },
    statut: { x: ML + 317, w: 90  },
    date:   { x: ML + 407, w: 65  },
  };

  function tableHeader() {
    const y = doc.y;
    doc.save().rect(ML, y, W, 15).fill("#f3f4f6").restore();
    const cells: { key: keyof typeof COL; label: string }[] = [
      { key: "num",     label: "#"          },
      { key: "nom",     label: "Membre"     },
      { key: "code",    label: "Code"       },
      { key: "village", label: "Village"    },
      { key: "score",   label: "Score"      },
      { key: "statut",  label: "Conformité" },
      { key: "date",    label: "Collecté le"},
    ];
    cells.forEach(({ key, label }) => {
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(couleur)
        .text(label, COL[key].x + 3, y + 3, { width: COL[key].w - 6, lineBreak: false });
    });
    doc.y = y + 18;
  }

  tableHeader();

  for (let i = 0; i < membres.length; i++) {
    const m = membres[i]!;

    // Nouvelle page si besoin
    if (doc.y > 730) {
      await drawFooter(doc, cooperativeId, pageNum, totalPages);
      pageNum++;
      doc.addPage();
      await drawHeader(doc, cooperativeId, { hauteur_reservee: 100 });
      sectionTitle(doc, `Résultats par membre (suite)`, couleur);
      tableHeader();
    }

    const rowY   = doc.y;
    const rowBg  = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    const reponses = (m.reponses ?? {}) as ReponsesCriteres;
    const hasDetail = Object.keys(reponses).length > 0;
    const rowH2 = hasDetail ? 14 + criteres.length * 11 + 4 : 14;

    // Guard: si trop grand pour la page, forcer saut
    if (rowY + rowH2 > 740) {
      await drawFooter(doc, cooperativeId, pageNum, totalPages);
      pageNum++;
      doc.addPage();
      await drawHeader(doc, cooperativeId, { hauteur_reservee: 100 });
      sectionTitle(doc, `Résultats par membre (suite)`, couleur);
      tableHeader();
    }

    const finalRowY = doc.y;
    doc.save().rect(ML, finalRowY, W, 14).fill(rowBg).restore();

    // Ligne principale
    const dateCollecte = m.dateCollecte
      ? new Date(m.dateCollecte).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" })
      : "—";
    const nomComplet = `${m.prenoms ?? ""} ${m.nom ?? ""}`.trim();
    const score = m.scoreCalcule !== null && m.scoreCalcule !== undefined ? `${m.scoreCalcule}%` : "—";

    doc.font("Helvetica").fontSize(7.5).fillColor("#111827");
    doc.text(String(i + 1), COL.num.x + 3,     finalRowY + 3, { width: COL.num.w - 6,     lineBreak: false });
    doc.text(nomComplet,    COL.nom.x + 3,     finalRowY + 3, { width: COL.nom.w - 6,     lineBreak: false });
    doc.text(m.code ?? "—", COL.code.x + 3,   finalRowY + 3, { width: COL.code.w - 6,    lineBreak: false });
    doc.text(m.village ?? "—", COL.village.x + 3, finalRowY + 3, { width: COL.village.w - 6, lineBreak: false });
    doc.font("Helvetica-Bold").text(score, COL.score.x + 3, finalRowY + 3, { width: COL.score.w - 6, lineBreak: false });
    doc.font("Helvetica").text(dateCollecte, COL.date.x + 3, finalRowY + 3, { width: COL.date.w - 6, lineBreak: false });

    // Badge conformité
    if (m.statutConformite) {
      badge(doc, COL.statut.x + 3, finalRowY + 2, STATUT_LABELS[m.statutConformite] ?? m.statutConformite, couleurStatut(m.statutConformite));
    } else if (m.statut === "en_attente") {
      doc.font("Helvetica").fontSize(7.5).fillColor("#9ca3af")
        .text("En attente", COL.statut.x + 3, finalRowY + 3, { lineBreak: false });
    }

    doc.y = finalRowY + 15;

    // Détail critères (si collecté)
    if (hasDetail && criteres.length > 0) {
      const detY = doc.y;
      doc.save().rect(ML + 22, detY, W - 22, criteres.length * 11 + 4).fill("#f8fafc").restore();
      criteres.forEach((critere, ci) => {
        const rep = reponses[critere];
        const valeur = rep?.valeur ?? "na";
        const couleurRep = valeur === "oui" ? "#16a34a" : valeur === "non" ? "#dc2626" : "#9ca3af";
        const icon      = valeur === "oui" ? "✓" : valeur === "non" ? "✗" : "–";
        const cy = detY + 2 + ci * 11;
        doc.font("Helvetica-Bold").fontSize(7).fillColor(couleurRep)
          .text(icon, ML + 26, cy, { width: 12, lineBreak: false });
        doc.font("Helvetica").fontSize(7).fillColor("#374151")
          .text(critere, ML + 38, cy, { width: W - 60, lineBreak: false });
        if (rep?.commentaire) {
          doc.font("Helvetica-Oblique").fontSize(6.5).fillColor("#6b7280")
            .text(` — ${rep.commentaire}`, ML + 38 + doc.fontSize(6.5).widthOfString(critere) + 4, cy, { lineBreak: false });
        }
      });
      doc.y = detY + criteres.length * 11 + 6;

      // Note agent
      if (m.notesAgent) {
        doc.font("Helvetica-Oblique").fontSize(7).fillColor("#6b7280")
          .text(`Note agent : ${m.notesAgent}`, ML + 26, doc.y, { width: W - 36 });
        doc.y += 2;
      }
    }

    // Séparateur léger
    doc.moveTo(ML, doc.y).lineTo(ML + W, doc.y).strokeColor("#e5e7eb").lineWidth(0.3).stroke();
    doc.y += 3;
  }

  // Footer dernière page
  await drawFooter(doc, cooperativeId, pageNum, totalPages);

  doc.end();

  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
