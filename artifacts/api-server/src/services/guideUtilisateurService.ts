/**
 * Service de génération du Guide Utilisateur CoopDigital (PDF)
 * Document générique — non lié à une coopérative spécifique.
 */
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

type PdfDoc = InstanceType<typeof PDFDocument>;

const VERT       = "#1a4731";
const VERT_CLAIR = "#2d6a4f";
const OR         = "#c4962a";
const GRIS_TEXTE = "#374151";
const GRIS_CLAIR = "#f3f4f6";
const BLANC      = "#ffffff";

function resolveLogoPath(): string {
  try {
    const dir =
      typeof __dirname !== "undefined"
        ? __dirname
        : path.dirname(fileURLToPath(import.meta.url));
    const distPath = path.join(dir, "public", "logo-192.png");
    if (fs.existsSync(distPath)) return distPath;
    return path.join(process.cwd(), "public", "logo-192.png");
  } catch {
    return path.join(process.cwd(), "public", "logo-192.png");
  }
}

const LOGO_PATH = resolveLogoPath();

// ── Helpers de mise en page ───────────────────────────────────────────────────

function pageW(doc: PdfDoc)       { return doc.page.width; }
function marginL()                 { return 50; }
function marginR(doc: PdfDoc)      { return doc.page.width - 50; }
function contentW(doc: PdfDoc)     { return pageW(doc) - 100; }

function newPage(doc: PdfDoc, titre: string) {
  doc.addPage();
  // Barre latérale verte gauche
  doc.save().rect(0, 0, 5, doc.page.height).fill(VERT).restore();
  // Titre de section en haut
  doc.save().rect(5, 0, pageW(doc) - 5, 36).fill(VERT).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(BLANC)
    .text(titre, marginL(), 11, { width: contentW(doc) - 30, lineBreak: false });
  // Numéro de page en haut à droite
  const pageNum = (doc as unknown as { _pageBuffer: unknown[] })._pageBuffer?.length ?? 1;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#aad4c0")
    .text(`${pageNum}`, marginR(doc) - 20, 14, { width: 20, align: "right", lineBreak: false });
  doc.y = 52;
  doc.x = marginL();
}

function sectionTitle(doc: PdfDoc, text: string) {
  const y = doc.y + 8;
  doc.save().rect(marginL(), y, contentW(doc), 22).fill(VERT_CLAIR).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(BLANC)
    .text(text.toUpperCase(), marginL() + 8, y + 6, { width: contentW(doc) - 16, lineBreak: false });
  doc.y = y + 30;
  doc.x = marginL();
}

function subTitle(doc: PdfDoc, text: string) {
  doc.y += 6;
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor(VERT)
    .text(text, marginL(), doc.y, { width: contentW(doc) });
  doc
    .moveTo(marginL(), doc.y + 2)
    .lineTo(marginL() + 120, doc.y + 2)
    .strokeColor(OR)
    .lineWidth(1.5)
    .stroke();
  doc.y += 8;
  doc.x = marginL();
}

function body(doc: PdfDoc, text: string) {
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(GRIS_TEXTE)
    .text(text, marginL(), doc.y, { width: contentW(doc), lineGap: 1.5 });
  doc.y += 4;
  doc.x = marginL();
}

function step(doc: PdfDoc, num: number, text: string) {
  const y = doc.y;
  // Cercle numéroté
  doc.save().circle(marginL() + 8, y + 6, 7).fill(OR).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor(BLANC)
    .text(String(num), marginL() + 4.5, y + 3, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(GRIS_TEXTE)
    .text(text, marginL() + 20, y, { width: contentW(doc) - 20, lineGap: 1.5 });
  doc.y += 3;
  doc.x = marginL();
}

function tip(doc: PdfDoc, text: string) {
  const y = doc.y + 3;
  const h = 14 + (text.length > 80 ? 10 : 0);
  doc.save().roundedRect(marginL(), y, contentW(doc), h, 4).fill("#fffbeb").restore();
  doc.save().roundedRect(marginL(), y, 3, h, 2).fill(OR).restore();
  doc
    .font("Helvetica-Oblique")
    .fontSize(8.5)
    .fillColor("#92400e")
    .text(`💡 ${text}`, marginL() + 10, y + 4, { width: contentW(doc) - 16 });
  doc.y += h + 6;
  doc.x = marginL();
}

function infoBox(doc: PdfDoc, text: string) {
  const y = doc.y + 3;
  const h = 14 + (text.length > 90 ? 10 : 0);
  doc.save().roundedRect(marginL(), y, contentW(doc), h, 4).fill("#eff6ff").restore();
  doc.save().roundedRect(marginL(), y, 3, h, 2).fill("#3b82f6").restore();
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#1e40af")
    .text(`ℹ️  ${text}`, marginL() + 10, y + 4, { width: contentW(doc) - 16 });
  doc.y += h + 6;
  doc.x = marginL();
}

function checkSpace(doc: PdfDoc, needed = 80) {
  if (doc.y + needed > doc.page.height - 60) {
    doc.addPage();
    doc.save().rect(0, 0, 5, doc.page.height).fill(VERT).restore();
    doc.y = 30;
    doc.x = marginL();
  }
}


export async function generateGuideUtilisateurAsync(): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 50, bottom: 50, left: 50, right: 50 }, autoFirstPage: false });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(buffers)));
    doc.on("error", reject);
    try {
      generateGuideContent(doc);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function generateGuideContent(doc: PdfDoc) {
  const cw = pageW(doc);

  // ══ PAGE DE COUVERTURE ═══════════════════════════════════════════════════════
  doc.addPage();
  doc.save().rect(0, 0, cw, 340).fill(VERT).restore();
  doc.save().polygon([0, 270], [cw, 200], [cw, 340], [0, 340]).fill(VERT_CLAIR).restore();

  if (fs.existsSync(LOGO_PATH)) {
    try { doc.image(LOGO_PATH, cw / 2 - 42, 60, { width: 84, height: 84 }); } catch { /* skip */ }
  }
  doc.font("Helvetica-Bold").fontSize(28).fillColor(BLANC).text("CoopDigital", 0, 162, { width: cw, align: "center" });
  doc.font("Helvetica").fontSize(12).fillColor("#a7d7bc").text("GESTION DES COOPÉRATIVES CACAOYÈRES", 0, 196, { width: cw, align: "center" });
  doc.save().rect(0, 260, cw, 80).fill(OR).restore();
  doc.font("Helvetica-Bold").fontSize(18).fillColor(BLANC).text("GUIDE D'UTILISATION", 0, 278, { width: cw, align: "center" });
  doc.font("Helvetica").fontSize(10).fillColor("#fff8e8").text("Manuel complet — Toutes fonctionnalités", 0, 302, { width: cw, align: "center" });
  doc.font("Helvetica").fontSize(9).fillColor("#9ca3af").text(
    `Version ${new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}   ·   M15 Tech`,
    0, 360, { width: cw, align: "center" },
  );
  doc.font("Helvetica").fontSize(8).fillColor("#d1d5db").text(
    "Ce guide est confidentiel et destiné aux utilisateurs autorisés de la plateforme CoopDigital.",
    50, 790, { width: cw - 100, align: "center" },
  );

  // ══ TABLE DES MATIÈRES ═══════════════════════════════════════════════════════
  doc.addPage();
  doc.save().rect(0, 0, 5, doc.page.height).fill(VERT).restore();
  doc.save().rect(5, 0, cw - 5, 44).fill(VERT).restore();
  doc.font("Helvetica-Bold").fontSize(15).fillColor(BLANC).text("TABLE DES MATIÈRES", marginL(), 14, { width: contentW(doc) });
  doc.y = 60; doc.x = marginL();

  const toc: [string, string][] = [
    ["1.", "Connexion & Navigation"],
    ["2.", "Tableau de bord"],
    ["3.", "Gestion des Membres"],
    ["4.", "Campagnes de collecte"],
    ["5.", "Livraisons de cacao"],
    ["6.", "Transport & Expéditions"],
    ["7.", "Traçabilité & Parcelles EUDR"],
    ["8.", "Gestion des Stocks"],
    ["9.", "Avances, Intrants & Règlements"],
    ["10.", "Commerce (Fournisseurs, Exportateurs, Ventes)"],
    ["11.", "Finances (Budget, Caisse, Banque, Comptabilité…)"],
    ["12.", "RH & Social"],
    ["13.", "Pilotage & Reporting"],
    ["14.", "Organisation & Administration"],
    ["15.", "Mode Hors Ligne"],
    ["16.", "Portail Membre"],
    ["17.", "Application Terrain (Agents)"],
    ["18.", "Aide & Support"],
  ];

  let tocY = doc.y;
  toc.forEach(([num, label], i) => {
    const bg = i % 2 === 0 ? GRIS_CLAIR : BLANC;
    doc.save().rect(marginL(), tocY, contentW(doc), 18).fill(bg).restore();
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(VERT).text(num, marginL() + 6, tocY + 5, { width: 22, lineBreak: false });
    doc.font("Helvetica").fontSize(9.5).fillColor(GRIS_TEXTE).text(label, marginL() + 28, tocY + 5, { width: contentW(doc) - 40, lineBreak: false });
    tocY += 18;
  });
  doc.y = tocY + 16; doc.x = marginL();
  tip(doc, "Ce guide couvre toutes les fonctionnalités selon votre rôle. Certaines sections peuvent ne pas s'afficher si vous n'avez pas les droits correspondants.");

  // ══ 1. CONNEXION ═════════════════════════════════════════════════════════════
  newPage(doc, "1. Connexion & Navigation");
  sectionTitle(doc, "Se connecter à l'application");
  step(doc, 1, "Ouvrez l'application CoopDigital dans votre navigateur (Chrome ou Safari recommandés).");
  step(doc, 2, "Saisissez votre adresse e-mail et votre mot de passe dans les champs prévus.");
  step(doc, 3, "Cliquez sur « Se connecter ». Vous serez redirigé vers votre tableau de bord.");
  tip(doc, "Votre session reste active 8 heures. Après inactivité, l'application vous redirige automatiquement vers la page de connexion.");
  sectionTitle(doc, "Interface principale");
  step(doc, 1, "Menu latéral (gauche) : accès à tous les modules selon votre rôle. Sur mobile, appuyez sur ☰ pour l'ouvrir.");
  step(doc, 2, "🔍 Recherche globale : retrouvez un membre, une livraison ou un document en quelques lettres.");
  step(doc, 3, "? Aide & Support : accès au guide, à la FAQ et aux tickets d'assistance.");
  step(doc, 4, "🔔 Notifications : alertes en temps réel sur les événements importants.");
  sectionTitle(doc, "Se déconnecter");
  step(doc, 1, "Dans le menu latéral, cliquez sur « Déconnexion » en bas.");
  step(doc, 2, "Confirmez dans la boîte de dialogue.");
  infoBox(doc, "Déconnectez-vous systématiquement sur un poste partagé pour protéger les données de la coopérative.");

  // ══ 2. TABLEAU DE BORD ════════════════════════════════════════════════════════
  newPage(doc, "2. Tableau de bord");
  sectionTitle(doc, "Indicateurs clés (KPIs)");
  step(doc, 1, "Membres actifs : nombre de producteurs enregistrés et actifs.");
  step(doc, 2, "Avances en cours : solde total des avances non remboursées (FCFA).");
  step(doc, 3, "Tonnage — Ce mois : quantité de cacao collectée sur la période (tonnes).");
  step(doc, 4, "Paiements — Ce mois : montant total des paiements confirmés (FCFA).");
  sectionTitle(doc, "Filtres de période");
  step(doc, 1, "Ce mois / Mois précédent / Toute la campagne : boutons de sélection rapide.");
  step(doc, 2, "Période personnalisée : choisissez manuellement les dates de début et de fin.");
  sectionTitle(doc, "Dernières livraisons & Avances en retard");
  body(doc, "Le tableau affiche les 5 dernières livraisons et les avances dont la date d'échéance est dépassée. Cliquez sur n'importe quel élément pour accéder à sa fiche détaillée.");
  tip(doc, "Les données se rafraîchissent automatiquement. Tirez vers le bas (mobile) pour forcer le rechargement.");

  // ══ 3. MEMBRES ════════════════════════════════════════════════════════════════
  newPage(doc, "3. Gestion des Membres");
  sectionTitle(doc, "Liste des membres");
  step(doc, 1, "Recherchez par nom, prénom ou numéro de téléphone.");
  step(doc, 2, "Filtrez par statut (Actif / Inactif / Suspendu), par délégué ou par village.");
  step(doc, 3, "Cliquez sur une ligne pour ouvrir la fiche complète du membre.");
  tip(doc, "La liste est paginée. Utilisez les boutons Précédent / Suivant en bas pour naviguer entre les pages.");
  sectionTitle(doc, "Créer un nouveau membre");
  step(doc, 1, "Cliquez sur « + Nouveau membre » en haut à droite.");
  step(doc, 2, "Remplissez : Nom, Prénoms, Sexe, Date de naissance, Téléphone, Village, Délégué.");
  step(doc, 3, "Ajoutez une photo (optionnel) via l'icône appareil photo.");
  step(doc, 4, "Cliquez sur « Enregistrer ». Un code membre unique est généré automatiquement.");
  infoBox(doc, "Le numéro de téléphone doit être unique dans la coopérative — il sert d'identifiant pour le Portail Membre.");
  sectionTitle(doc, "Fiche membre & QR Code");
  step(doc, 1, "Informations personnelles, coordonnées, statut.");
  step(doc, 2, "QR Code unique — scannez pour identifier rapidement sur le terrain.");
  step(doc, 3, "Historique des livraisons, avances et score producteur.");
  sectionTitle(doc, "Cartes membres");
  step(doc, 1, "Sélectionnez les membres voulus, cliquez « Générer les cartes ».");
  step(doc, 2, "Téléchargez le PDF et imprimez les cartes d'identification officielles.");

  // ══ 4. CAMPAGNES ══════════════════════════════════════════════════════════════
  newPage(doc, "4. Campagnes de collecte");
  sectionTitle(doc, "Créer une campagne");
  step(doc, 1, "Accédez au module Campagnes → « + Nouvelle campagne ».");
  step(doc, 2, "Saisissez le libellé (ex: Campagne 2024-2025), les dates et le prix par kg.");
  step(doc, 3, "Créez. La campagne devient active et toutes les nouvelles livraisons s'y rattachent.");
  infoBox(doc, "Une seule campagne peut être active à la fois. La clôture archive toutes ses données définitivement.");
  sectionTitle(doc, "Clôturer une campagne");
  step(doc, 1, "Sélectionnez la campagne active, cliquez « Clôturer ».");
  step(doc, 2, "Confirmez. Les données sont archivées et consultables en lecture seule.");

  // ══ 5. LIVRAISONS ════════════════════════════════════════════════════════════
  newPage(doc, "5. Livraisons de cacao");
  sectionTitle(doc, "Saisir une livraison");
  step(doc, 1, "Cliquez sur « + Nouvelle livraison ».");
  step(doc, 2, "Recherchez le membre par nom/code ou scannez son QR code.");
  step(doc, 3, "Saisissez le poids brut en kg et le type de produit.");
  step(doc, 4, "Le montant brut est calculé automatiquement (poids × prix unitaire).");
  step(doc, 5, "Les déductions d'avance et d'intrants s'affichent automatiquement.");
  step(doc, 6, "Vérifiez le montant net payable, puis validez.");
  step(doc, 7, "Téléchargez le reçu PDF si besoin.");
  tip(doc, "La déduction d'avance est automatique et irréversible — vérifiez le montant net avant de valider.");
  sectionTitle(doc, "Règlements");
  step(doc, 1, "Sélectionnez les livraisons à régler.");
  step(doc, 2, "Choisissez le mode : espèces, Mobile Money ou virement.");
  step(doc, 3, "Confirmez. Le statut passe à « Payé ».");

  // ══ 6. TRANSPORT & EXPÉDITIONS ════════════════════════════════════════════════
  newPage(doc, "6. Transport & Expéditions");
  sectionTitle(doc, "Transport interne");
  step(doc, 1, "Créez un bon de transport : origine, destination, véhicule, quantité.");
  step(doc, 2, "À l'arrivée, confirmez la réception et saisissez le poids à destination.");
  step(doc, 3, "L'écart de poids est calculé et signalé automatiquement.");
  sectionTitle(doc, "Expéditions port");
  step(doc, 1, "Créez une expédition, sélectionnez les lots et l'exportateur destinataire.");
  step(doc, 2, "Renseignez le document de transport (LTA, BL) et la date.");
  step(doc, 3, "Suivez le statut : Préparation → En transit → Livré → Facturé.");
  infoBox(doc, "Chaque lot expédié doit avoir ses coordonnées GPS enregistrées pour la conformité EUDR.");

  // ══ 7. TRAÇABILITÉ ════════════════════════════════════════════════════════════
  newPage(doc, "7. Traçabilité & Parcelles EUDR");
  sectionTitle(doc, "Traçabilité du cacao");
  step(doc, 1, "Chaque livraison est associée à un producteur identifié.");
  step(doc, 2, "Les lots sont constitués à partir des livraisons et suivis jusqu'à l'exportation.");
  step(doc, 3, "Exportez le rapport de traçabilité en PDF pour les audits.");
  sectionTitle(doc, "Parcelles & Conformité EUDR");
  step(doc, 1, "Enregistrez les coordonnées GPS des parcelles de chaque producteur.");
  step(doc, 2, "Le système vérifie la conformité : pas de superposition avec des zones forestières protégées.");
  step(doc, 3, "Un indicateur vert/orange/rouge indique le niveau de conformité.");
  step(doc, 4, "Exportez le rapport de conformité pour acheteurs et certifications.");
  tip(doc, "Les agents terrain collectent les GPS depuis l'application mobile lors des visites de parcelles.");

  // ══ 8. STOCKS ════════════════════════════════════════════════════════════════
  newPage(doc, "8. Gestion des Stocks");
  sectionTitle(doc, "Suivi des stocks");
  step(doc, 1, "Chaque livraison validée génère automatiquement une entrée en stock.");
  step(doc, 2, "Les expéditions et transports génèrent des sorties de stock.");
  step(doc, 3, "Le stock disponible en temps réel est affiché par entrepôt.");
  sectionTitle(doc, "Stocks refoulés");
  step(doc, 1, "Enregistrez un refus : raison, poids refoulé, producteur concerné.");
  step(doc, 2, "Le producteur peut représenter le lot après séchage.");
  step(doc, 3, "Suivez le taux de refus par producteur pour anticiper les formations qualité.");
  sectionTitle(doc, "Entrepôts délégués");
  body(doc, "Chaque délégué dispose d'un entrepôt virtuel. Suivez les stocks collectés avant transfert vers l'entrepôt central.");

  // ══ 9. AVANCES ════════════════════════════════════════════════════════════════
  newPage(doc, "9. Avances, Intrants & Règlements");
  sectionTitle(doc, "Créer une avance");
  step(doc, 1, "Module Avances → « + Nouvelle avance ».");
  step(doc, 2, "Recherchez le membre bénéficiaire.");
  step(doc, 3, "Saisissez le montant (FCFA), la date d'octroi, le motif et la date d'échéance.");
  step(doc, 4, "Validez. L'avance est créée avec le statut « En cours ».");
  infoBox(doc, "Un producteur ne peut avoir qu'une avance active à la fois. La déduction se fait automatiquement à chaque livraison.");
  sectionTitle(doc, "Remboursement manuel");
  body(doc, "Cliquez sur l'avance → « Rembourser manuellement » → saisissez le montant perçu en espèces.");
  sectionTitle(doc, "Intrants agricoles");
  step(doc, 1, "Enregistrez la distribution : intrant, quantité, bénéficiaire, coût.");
  step(doc, 2, "Le montant est déduit automatiquement des prochaines livraisons du producteur.");

  // ══ 10. COMMERCE ═════════════════════════════════════════════════════════════
  newPage(doc, "10. Commerce");
  sectionTitle(doc, "Fournisseurs & Exportateurs");
  step(doc, 1, "Fournisseurs : entreprises livrant intrants, équipements ou services.");
  step(doc, 2, "Exportateurs : acheteurs du cacao (sociétés d'exportation agréées).");
  step(doc, 3, "Pour chaque tiers : raison sociale, contacts, agrément, coordonnées bancaires.");
  sectionTitle(doc, "Ventes de cacao");
  step(doc, 1, "Créez une vente en sélectionnant les lots et l'exportateur.");
  step(doc, 2, "Saisissez le prix négocié, la date et les conditions de paiement.");
  step(doc, 3, "Générez la facture PDF. Suivez les encaissements dans le module Créances.");
  sectionTitle(doc, "Suivi des Prix");
  body(doc, "Suivez l'évolution des prix du cacao et comparez avec les références du marché. Mettez à jour régulièrement le prix d'achat — toutes les nouvelles livraisons l'utilisent automatiquement.");

  // ══ 11. FINANCES ═════════════════════════════════════════════════════════════
  newPage(doc, "11. Finances");
  sectionTitle(doc, "Tableau de bord financier");
  body(doc, "Vue synthétique : trésorerie, créances, dettes et rentabilité de la campagne en cours.");
  sectionTitle(doc, "Budget");
  body(doc, "Planification annuelle : définissez dépenses et recettes prévisionnelles, suivez les réalisations mois par mois.");
  sectionTitle(doc, "Caisse");
  step(doc, 1, "Enregistrez chaque mouvement d'espèces (date, motif, justificatif).");
  step(doc, 2, "Le solde est calculé en temps réel.");
  step(doc, 3, "Clôturez la caisse chaque soir pour valider la journée.");
  sectionTitle(doc, "Comptabilité OHADA");
  step(doc, 1, "Les livraisons, paiements et avances génèrent automatiquement des propositions d'écritures.");
  step(doc, 2, "Validez les écritures ou saisissez-les manuellement.");
  step(doc, 3, "Générez la balance, le grand livre, le bilan et le compte de résultat.");
  sectionTitle(doc, "Autres modules financiers");
  step(doc, 1, "Salaires : paie du personnel permanent et saisonnier.");
  step(doc, 2, "Emprunts : crédits bancaires et remboursements.");
  step(doc, 3, "Mobile Marchands : paiements via Orange Money, MTN MoMo…");
  step(doc, 4, "Fiscalité : obligations fiscales (TVA, impôts, taxes).");
  step(doc, 5, "Réconciliation : rapprochement des flux Mobile Money avec la comptabilité.");
  step(doc, 6, "Investissements : patrimoine et immobilisations.");

  // ══ 12. RH & SOCIAL ══════════════════════════════════════════════════════════
  newPage(doc, "12. RH & Social");
  sectionTitle(doc, "Formations");
  step(doc, 1, "Créez un programme : thème, formateur, date, lieu.");
  step(doc, 2, "Enregistrez les participants et marquez les présences.");
  step(doc, 3, "Générez les attestations de participation.");
  step(doc, 4, "Suivez le taux de couverture par village et par thème.");
  sectionTitle(doc, "Formations RSE");
  body(doc, "Spécifiques aux engagements RSE (travail des enfants, certification durable, genre…). Prouvez la conformité aux standards Rainforest Alliance, Fairtrade, UTZ.");
  sectionTitle(doc, "Équipements");
  body(doc, "Inventaire du matériel (bascules, véhicules, équipements de séchage). Suivez l'entretien et l'amortissement.");

  // ══ 13. PILOTAGE ══════════════════════════════════════════════════════════════
  newPage(doc, "13. Pilotage & Reporting");
  sectionTitle(doc, "Reporting");
  step(doc, 1, "Choisissez le type de rapport (productivité, financier, qualité…).");
  step(doc, 2, "Définissez la période et les filtres.");
  step(doc, 3, "Générez et téléchargez en PDF ou Excel.");
  sectionTitle(doc, "Prévisions");
  body(doc, "Basé sur les historiques, ce module projette la production attendue et aide à planifier les achats de fonds.");
  sectionTitle(doc, "Anomalies");
  body(doc, "Détection automatique des incohérences (livraisons aberrantes, prix incorrects, doublons). Les anomalies critiques affichent une pastille rouge dans le menu.");
  step(doc, 1, "Consultez les anomalies détectées.");
  step(doc, 2, "Marquez-les comme résolues ou signalez-les comme fausses alertes.");
  sectionTitle(doc, "Journal d'audit");
  body(doc, "Historique de toutes les actions (qui a modifié quoi et quand). Indispensable pour les audits de certification et la détection de fraudes.");

  // ══ 14. ORGANISATION ══════════════════════════════════════════════════════════
  newPage(doc, "14. Organisation & Administration");
  sectionTitle(doc, "Gouvernance");
  body(doc, "Assemblées générales, conseils d'administration, procès-verbaux. Archivez les décisions officielles de la coopérative.");
  sectionTitle(doc, "Communication interne");
  body(doc, "Messagerie entre utilisateurs. Envoyez des messages aux membres, délégués ou groupes. Les messages non lus sont indiqués par une pastille rouge dans le menu.");
  sectionTitle(doc, "Administration des comptes");
  step(doc, 1, "Créez un utilisateur : rôle, email, mot de passe temporaire.");
  step(doc, 2, "Rôles disponibles : PCA · Directeur · Comptable · Magasinier · Responsable Traçabilité · Délégué · Auditeur · Agent Terrain.");
  step(doc, 3, "Désactivez un compte lors d'un départ de collaborateur.");
  sectionTitle(doc, "Paramètres");
  body(doc, "Nom officiel, logo, couleurs, adresse, numéro d'agrément, contacts, pied de page PDF, seuils d'alerte.");

  // ══ 15. MODE HORS LIGNE ═══════════════════════════════════════════════════════
  newPage(doc, "15. Mode Hors Ligne");
  sectionTitle(doc, "Fonctionnement sans internet");
  infoBox(doc, "Une bannière orange « Hors connexion — données en cache affichées » apparaît automatiquement dès que la connexion est perdue.");
  step(doc, 1, "Les données récentes restent affichées depuis le cache de l'appareil.");
  step(doc, 2, "Sur l'app Terrain, les livraisons, paiements, avances et GPS sont enregistrés localement.");
  step(doc, 3, "À la reconnexion, la synchronisation démarre automatiquement.");
  step(doc, 4, "Les opérations en attente sont visibles dans le module « Opérations hors ligne ».");
  tip(doc, "Synchronisez régulièrement pour éviter l'accumulation d'opérations en attente. Une synchronisation forcée est disponible depuis le module dédié.");

  // ══ 16. PORTAIL MEMBRE ════════════════════════════════════════════════════════
  newPage(doc, "16. Portail Membre");
  sectionTitle(doc, "Accès producteurs");
  step(doc, 1, "Ouvrez le lien Portail Membre fourni par votre coopérative.");
  step(doc, 2, "Saisissez votre Code Membre (ex: MBR-0042) et votre numéro de téléphone.");
  step(doc, 3, "Accédez à votre espace personnel.");
  sectionTitle(doc, "Informations disponibles");
  step(doc, 1, "Mon profil : informations personnelles et statut.");
  step(doc, 2, "Mes livraisons : historique avec reçus PDF téléchargeables.");
  step(doc, 3, "Mes avances : solde et calendrier de remboursement.");
  step(doc, 4, "Mes intrants : liste et montants à rembourser.");
  step(doc, 5, "Parts sociales : parts souscrites et libérées.");
  step(doc, 6, "Mon score : qualité de production et régularité.");
  step(doc, 7, "Mes notifications : alertes et messages de la coopérative.");
  infoBox(doc, "Le producteur peut télécharger sa carte membre officielle PDF directement depuis le portail.");

  // ══ 17. APP TERRAIN ═══════════════════════════════════════════════════════════
  newPage(doc, "17. Application Terrain (Agents)");
  sectionTitle(doc, "Connexion");
  step(doc, 1, "Ouvrez l'application Terrain sur votre smartphone.");
  step(doc, 2, "Saisissez votre numéro de téléphone et mot de passe.");
  sectionTitle(doc, "Enregistrer une collecte");
  step(doc, 1, "Appuyez sur « + Nouvelle collecte ».");
  step(doc, 2, "Recherchez ou scannez le QR code du producteur.");
  step(doc, 3, "Saisissez le poids en kg sur la bascule.");
  step(doc, 4, "Confirmez. La collecte est enregistrée (localement si hors ligne).");
  sectionTitle(doc, "Missions de traçabilité GPS");
  step(doc, 1, "Consultez les missions de visites de parcelles assignées.");
  step(doc, 2, "Appuyez sur « Collecter GPS » pour chaque parcelle.");
  step(doc, 3, "Restez immobile quelques secondes pour une précision optimale, puis validez.");
  step(doc, 4, "Ajoutez photos et observations si nécessaire.");
  step(doc, 5, "Soumettez la mission une fois toutes les parcelles visitées.");
  sectionTitle(doc, "Rapport journalier");
  body(doc, "En fin de journée : Profil → « Envoyer le rapport ». Le superviseur reçoit automatiquement un récapitulatif de vos activités.");

  // ══ 18. AIDE & SUPPORT ════════════════════════════════════════════════════════
  newPage(doc, "18. Aide & Support");
  sectionTitle(doc, "Centre d'aide");
  body(doc, "Le bouton « ? » en haut à droite ouvre le panneau d'aide M15 Tech.");
  subTitle(doc, "FAQ");
  body(doc, "Réponses aux questions fréquentes, organisées par module. Commencez toujours par la FAQ avant de créer un ticket.");
  subTitle(doc, "Créer un ticket d'assistance");
  step(doc, 1, "Onglet « Signaler » → renseignez titre, type (Bug/Question/Formation) et priorité.");
  step(doc, 2, "Décrivez le problème en détail (action effectuée, message d'erreur affiché).");
  step(doc, 3, "Soumettez. Un numéro de référence vous est attribué. Suivez l'avancement dans « Mes tickets ».");
  subTitle(doc, "Contact direct M15 Tech");
  step(doc, 1, "WhatsApp : 07 14 17 40 82");
  step(doc, 2, "Email : contacteyouss@gmail.com");
  infoBox(doc, "Mentionnez toujours votre numéro de ticket dans vos échanges pour un traitement plus rapide.");

  // ══ PAGE FINALE ══════════════════════════════════════════════════════════════
  doc.addPage();
  doc.save().rect(0, 0, cw, doc.page.height).fill(VERT).restore();
  doc.save().polygon([0, 500], [cw, 400], [cw, doc.page.height], [0, doc.page.height]).fill(VERT_CLAIR).restore();
  doc.font("Helvetica-Bold").fontSize(22).fillColor(BLANC).text("Merci d'utiliser CoopDigital", 0, 260, { width: cw, align: "center" });
  doc.font("Helvetica").fontSize(11).fillColor("#a7d7bc").text("La plateforme au service des coopératives cacaoyères de Côte d'Ivoire", 0, 296, { width: cw, align: "center" });
  doc.save().rect(cw / 2 - 80, 336, 160, 2).fill(OR).restore();
  doc.font("Helvetica").fontSize(10).fillColor("#d1fae5").text(
    "Pour toute question ou suggestion d'amélioration,\ncontactez notre équipe support M15 Tech.",
    0, 356, { width: cw, align: "center", lineGap: 4 },
  );
  doc.font("Helvetica").fontSize(9).fillColor("#6ee7b7").text(
    `© ${new Date().getFullYear()} M15 Tech — Tous droits réservés`,
    0, 720, { width: cw, align: "center" },
  );
}
