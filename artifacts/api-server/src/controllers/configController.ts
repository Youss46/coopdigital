import { type Request, type Response } from "express";
import PDFDocument from "pdfkit";
import { UpdateConfigBody, CreateDocumentOfficielBody } from "@workspace/api-zod";
import {
  getConfig,
  upsertConfig,
  updateLogoUrl,
  getDocumentsOfficiels,
  createDocumentOfficiel,
  deleteDocumentOfficiel,
} from "../services/configService";
import { invalidateLogoCache, drawHeader, drawFooter } from "../services/pdfHeaderService";
import type { ConfigCooperative } from "@workspace/db";

function toDateStr(d: Date | null | undefined): string | null | undefined {
  if (d == null) return d;
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
}

function toApiConfig(row: ConfigCooperative) {
  return {
    id:                         row.id,
    cooperative_id:             row.cooperativeId,
    nom_complet:                row.nomComplet,
    nom_abrege:                 row.nomAbrege,
    logo_url:                   row.logoUrl,
    slogan:                     row.slogan,
    adresse:                    row.adresse,
    ville:                      row.ville,
    region:                     row.region,
    pays:                       row.pays,
    telephone:                  row.telephone,
    telephone2:                 row.telephone2,
    email:                      row.email,
    site_web:                   row.siteWeb,
    boite_postale:              row.boitePostale,
    numero_agrement:            row.numeroAgrement,
    date_agrement:              row.dateAgrement,
    autorite_agrement:          row.autoriteAgrement,
    forme_juridique:            row.formeJuridique,
    numero_rccm:                row.numeroRccm,
    numero_contribuable:        row.numeroContribuable,
    date_creation:              row.dateCreation,
    banque_principale:          row.banquePrincipale,
    numero_compte_bancaire:     row.numeroCompteBancaire,
    iban:                       row.iban,
    swift:                      row.swift,
    devise:                     row.devise,
    exercice_fiscal_debut_mois: row.exerciceFiscalDebutMois,
    produit_principal:          row.produitPrincipal,
    zone_collecte:              row.zoneCollecte,
    superficie_totale_ha:       row.superficieTotaleHa,
    valeur_nominale_part_fcfa:  row.valeurNominalePartFcfa,
    nbre_parts_min:             row.nbrePartsMin,
    cotisation_annuelle_fcfa:   row.cotisationAnnuelleFcfa,
    quorum_ag_pct:              row.quorumAgPct,
    couleur_primaire:           row.couleurPrimaire,
    couleur_secondaire:         row.couleurSecondaire,
    pied_de_page_pdf:           row.piedDePagePdf,
    updated_at:                 row.updatedAt,
  };
}

export async function handleGetConfig(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }
    const config = await getConfig(cooperativeId);
    res.json(config ? toApiConfig(config) : {});
  } catch (err) {
    req.log.error({ err }, "Erreur getConfig");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUpdateConfig(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    const userId = req.user?.id;
    if (!cooperativeId || !userId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }

    const parse = UpdateConfigBody.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
      return;
    }

    const d = parse.data;
    const updated = await upsertConfig(cooperativeId, userId, {
      nomComplet:               d.nom_complet              ?? undefined,
      nomAbrege:                d.nom_abrege               ?? undefined,
      slogan:                   d.slogan                   ?? undefined,
      adresse:                  d.adresse                  ?? undefined,
      ville:                    d.ville                    ?? undefined,
      region:                   d.region                   ?? undefined,
      pays:                     d.pays                     ?? undefined,
      telephone:                d.telephone                ?? undefined,
      telephone2:               d.telephone2               ?? undefined,
      email:                    d.email                    ?? undefined,
      siteWeb:                  d.site_web                 ?? undefined,
      boitePostale:             d.boite_postale            ?? undefined,
      numeroAgrement:           d.numero_agrement          ?? undefined,
      dateAgrement:             toDateStr(d.date_agrement) ?? undefined,
      autoriteAgrement:         d.autorite_agrement        ?? undefined,
      formeJuridique:           d.forme_juridique          ?? undefined,
      numeroRccm:               d.numero_rccm              ?? undefined,
      numeroContribuable:       d.numero_contribuable      ?? undefined,
      dateCreation:             toDateStr(d.date_creation) ?? undefined,
      banquePrincipale:         d.banque_principale        ?? undefined,
      numeroCompteBancaire:     d.numero_compte_bancaire   ?? undefined,
      iban:                     d.iban                     ?? undefined,
      swift:                    d.swift                    ?? undefined,
      devise:                   d.devise                   ?? undefined,
      exerciceFiscalDebutMois:  d.exercice_fiscal_debut_mois ?? undefined,
      produitPrincipal:         d.produit_principal        ?? undefined,
      zoneCollecte:             d.zone_collecte            ?? undefined,
      superficieTotaleHa:       d.superficie_totale_ha     != null ? String(d.superficie_totale_ha) : undefined,
      valeurNominalePartFcfa:   d.valeur_nominale_part_fcfa != null ? String(d.valeur_nominale_part_fcfa) : undefined,
      nbrePartsMin:             d.nbre_parts_min           ?? undefined,
      cotisationAnnuelleFcfa:   d.cotisation_annuelle_fcfa != null ? String(d.cotisation_annuelle_fcfa) : undefined,
      quorumAgPct:              d.quorum_ag_pct            != null ? String(d.quorum_ag_pct) : undefined,
      couleurPrimaire:          d.couleur_primaire         ?? undefined,
      couleurSecondaire:        d.couleur_secondaire       ?? undefined,
      piedDePagePdf:            d.pied_de_page_pdf         ?? undefined,
    });

    invalidateLogoCache(cooperativeId);

    res.json(updated ? toApiConfig(updated) : {});
  } catch (err) {
    req.log.error({ err }, "Erreur updateConfig");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUploadLogo(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    const userId = req.user?.id;
    if (!cooperativeId || !userId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }

    const { data_url, content_type } = req.body as { data_url: string; content_type: string };
    if (!data_url || !content_type) {
      res.status(400).json({ erreur: "Données manquantes pour l'upload" });
      return;
    }

    if (!data_url.startsWith("data:image/")) {
      res.status(400).json({ erreur: "Format invalide — seules les images sont acceptées." });
      return;
    }

    // PDFKit ne supporte que PNG et JPEG
    const FORMATS_SUPPORTES = ["image/png", "image/jpeg", "image/jpg"];
    const normalizedType = content_type.toLowerCase().split(";")[0]?.trim() ?? "";
    if (!FORMATS_SUPPORTES.includes(normalizedType)) {
      res.status(400).json({
        erreur: `Format "${content_type}" non supporté pour le logo PDF. Utilisez PNG ou JPEG.`,
      });
      return;
    }

    // Limite 2 Mo — base64 ≈ 1.37× la taille originale
    const base64Part = data_url.split(",")[1] ?? "";
    if (Math.ceil(base64Part.length * 0.75) > 2 * 1024 * 1024) {
      res.status(400).json({ erreur: "Logo trop volumineux (max 2 Mo)" });
      return;
    }

    await updateLogoUrl(cooperativeId, userId, data_url);
    invalidateLogoCache(cooperativeId);

    res.json({ logo_url: data_url });
  } catch (err) {
    req.log.error({ err }, "Erreur uploadLogo");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetDocuments(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }
    const documents = await getDocumentsOfficiels(cooperativeId);
    res.json({ documents });
  } catch (err) {
    req.log.error({ err }, "Erreur getDocuments");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateDocument(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }

    const parse = CreateDocumentOfficielBody.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
      return;
    }

    const d = parse.data;
    const doc = await createDocumentOfficiel(cooperativeId, {
      type:           d.type,
      libelle:        d.libelle,
      fichierUrl:     d.fichier_url,
      dateDocument:   toDateStr(d.date_document)   ?? null,
      dateExpiration: toDateStr(d.date_expiration) ?? null,
    });

    res.status(201).json(doc);
  } catch (err) {
    req.log.error({ err }, "Erreur createDocument");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleDeleteDocument(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }

    const documentId = parseInt(String(req.params["id"]));
    if (isNaN(documentId)) {
      res.status(400).json({ erreur: "ID invalide" });
      return;
    }

    const deleted = await deleteDocumentOfficiel(cooperativeId, documentId);
    if (!deleted) {
      res.status(404).json({ erreur: "Document introuvable" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Erreur deleteDocument");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

const MOIS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function fmtDate(d: string | null | undefined): string | null {
  if (!d) return null;
  try { return new Date(d + "T12:00:00").toLocaleDateString("fr-FR"); } catch { return d; }
}

function fmtNumber(v: string | number | null | undefined): string | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (isNaN(n)) return String(v);
  return n.toLocaleString("fr-FR");
}

export async function handleExportConfigPdf(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }

    const cfg = await getConfig(cooperativeId);
    if (!cfg) {
      res.status(404).json({ erreur: "Aucune configuration trouvée" });
      return;
    }

    const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
    const MARGIN = 40;
    const W   = doc.page.width;
    const CW  = W - MARGIN * 2;
    const LBL = 180;
    const VAL = CW - LBL - 10;
    const couleur = cfg.couleurPrimaire || "#1a4731";

    const safeName = (cfg.nomComplet ?? "parametres").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="parametres_${safeName}.pdf"`);
    doc.pipe(res);

    await drawHeader(doc, cooperativeId, { titre_document: "FICHE DE PARAMÈTRES" });

    let y = 106;

    function checkPage(): void {
      if (y > doc.page.height - 70) {
        doc.addPage();
        y = 40;
      }
    }

    function sectionTitle(title: string): void {
      checkPage();
      doc.rect(MARGIN, y, CW, 18).fill(couleur);
      doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#ffffff")
        .text(title, MARGIN + 8, y + 5, { width: CW - 16, lineBreak: false });
      y += 24;
    }

    function row(label: string, value: string | number | null | undefined): void {
      if (value == null || value === "") return;
      checkPage();
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#666666")
        .text(label, MARGIN, y, { width: LBL, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#111111")
        .text(String(value), MARGIN + LBL, y, { width: VAL });
      y += doc.currentLineHeight(true) + 4;
      if (y < MARGIN + LBL + 18) y = MARGIN + LBL + 18;
    }

    function gap(n = 8): void { y += n; }

    sectionTitle("Identité");
    row("Nom complet",  cfg.nomComplet);
    row("Nom abrégé",   cfg.nomAbrege);
    row("Slogan",       cfg.slogan);
    gap();

    sectionTitle("Coordonnées");
    row("Adresse",              cfg.adresse);
    row("Ville",                cfg.ville);
    row("Région",               cfg.region);
    row("Pays",                 cfg.pays);
    row("Téléphone principal",  cfg.telephone);
    row("Téléphone secondaire", cfg.telephone2);
    row("Email",                cfg.email);
    row("Site web",             cfg.siteWeb);
    row("Boîte postale",        cfg.boitePostale);
    gap();

    sectionTitle("Informations juridiques");
    row("Forme juridique",      cfg.formeJuridique);
    row("Numéro d'agrément",    cfg.numeroAgrement);
    row("Date d'agrément",      fmtDate(cfg.dateAgrement));
    row("Autorité d'agrément",  cfg.autoriteAgrement);
    row("Date de création",     fmtDate(cfg.dateCreation));
    row("Numéro RCCM",          cfg.numeroRccm);
    row("Numéro contribuable",  cfg.numeroContribuable);
    gap();

    sectionTitle("Informations bancaires");
    row("Banque principale",    cfg.banquePrincipale);
    row("Numéro de compte",     cfg.numeroCompteBancaire);
    row("IBAN",                 cfg.iban);
    row("SWIFT / BIC",          cfg.swift);
    row("Devise",               cfg.devise);
    if (cfg.exerciceFiscalDebutMois != null) {
      row("Début exercice fiscal", MOIS_FR[(cfg.exerciceFiscalDebutMois - 1)] ?? String(cfg.exerciceFiscalDebutMois));
    }
    gap();

    sectionTitle("Informations opérationnelles");
    row("Produit principal",     cfg.produitPrincipal);
    row("Zone de collecte",      cfg.zoneCollecte);
    row("Superficie totale (ha)", fmtNumber(cfg.superficieTotaleHa));
    gap();

    sectionTitle("Parts sociales & Cotisations");
    row("Valeur nominale d'une part (FCFA)", fmtNumber(cfg.valeurNominalePartFcfa));
    row("Nombre de parts minimum",           cfg.nbrePartsMin);
    row("Cotisation annuelle (FCFA)",        fmtNumber(cfg.cotisationAnnuelleFcfa));
    row("Quorum AG requis (%)",              fmtNumber(cfg.quorumAgPct));
    gap();

    doc.flushPages();
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      await drawFooter(doc, cooperativeId, i + 1, totalPages);
    }

    doc.end();
  } catch (err) {
    req.log.error({ err }, "Erreur exportConfigPdf");
    if (!res.headersSent) res.status(500).json({ erreur: "Erreur interne" });
  }
}
