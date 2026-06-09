import { type Request, type Response } from "express";
import { UpdateConfigBody, CreateDocumentOfficielBody } from "@workspace/api-zod";
import {
  getConfig,
  upsertConfig,
  updateLogoUrl,
  getDocumentsOfficiels,
  createDocumentOfficiel,
  deleteDocumentOfficiel,
} from "../services/configService";
import { invalidateLogoCache } from "../services/pdfHeaderService";

function toDateStr(d: Date | null | undefined): string | null | undefined {
  if (d == null) return d;
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
}

export async function handleGetConfig(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(400).json({ erreur: "Coopérative introuvable" });
      return;
    }
    const config = await getConfig(cooperativeId);
    res.json(config ?? {});
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

    res.json(updated);
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
