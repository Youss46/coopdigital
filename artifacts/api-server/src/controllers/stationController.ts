/**
 * Contrôleurs publics pour l'espace station-service.
 * Ces endpoints ne requièrent PAS d'authentification coopérative :
 * le numéro du bon sert de jeton d'accès (unique par coopérative).
 */
import type { Request, Response } from "express";
import {
  signQrPayload,
  verifyQrPayload,
  PUBLIC_KEY_SPKI_B64,
  QR_TTL_MS,
} from "../lib/stationQrCrypto";
import {
  getBonCarburantByNumero,
  transitionBon,
  createDepense,
} from "../services/transportService";
import { db, paiementsTable } from "@workspace/db";

// ── GET /station/carburant/public-key ─────────────────────────────────────────
// Retourne la clé publique Ed25519 en SPKI base64 pour vérification offline.
export async function handleGetPublicKey(
  _req: Request,
  res: Response,
): Promise<void> {
  res.json({ alg: "Ed25519", spki: PUBLIC_KEY_SPKI_B64 });
}

// ── GET /terrain/chauffeur/bons-carburant/:numero/qr-token ───────────────────
// Génère un payload signé Ed25519 pour encoder dans le QR code.
// Réservé au chauffeur propriétaire du bon (terrainAuthMiddleware requis).
export async function handleQrTokenBonStation(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    // Vérifier que l'appelant est bien un chauffeur avec un compte rattaché
    const agentChauffeurId = req.agent?.chauffeurId ?? null;
    if (req.agent?.role !== "chauffeur" || !agentChauffeurId) {
      res.status(403).json({ erreur: "Accès réservé au chauffeur du bon" });
      return;
    }

    const numero = String(req.params["numero"]).toUpperCase();
    const row = await getBonCarburantByNumero(numero);

    if (!row) {
      res.status(404).json({ erreur: "Bon introuvable" });
      return;
    }

    // Vérifier que le bon appartient à la même coopérative que le chauffeur
    if (row.bon.cooperativeId !== req.agent?.cooperativeId) {
      res.status(403).json({ erreur: "Ce bon n'appartient pas à votre coopérative" });
      return;
    }

    // S'assurer que ce bon appartient bien au chauffeur connecté
    if (row.bon.chauffeurId !== agentChauffeurId) {
      res.status(403).json({ erreur: "Ce bon ne vous appartient pas" });
      return;
    }

    if (row.bon.statut !== "approuve") {
      res
        .status(400)
        .json({ erreur: "Seuls les bons approuvés peuvent générer un QR" });
      return;
    }

    const b = row.bon;
    const qrData = {
      v: 1,
      num: b.numero,
      qte: parseFloat(b.quantiteAutorisee),
      type: b.typeCarburant,
      immat: row.immatriculation ?? null,
      chauffeur: row.chauffeurNom
        ? `${row.chauffeurPrenoms ?? ""} ${row.chauffeurNom}`.trim()
        : null,
      marque: row.marque ?? null,
      date_em: b.dateEmission,
      motif: b.motif ?? null,
      exp: Date.now() + QR_TTL_MS,
    };

    const payload = Buffer.from(JSON.stringify(qrData)).toString("base64url");
    const sig = signQrPayload(payload);

    res.json({ payload, sig, spki: PUBLIC_KEY_SPKI_B64 });
  } catch (err) {
    req.log.error({ err }, "Erreur qrTokenBonStation");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── GET /station/carburant/bons/:numero ───────────────────────────────────────
// Vérifie un bon et retourne les infos nécessaires à la station.
export async function handleVerifierBonStation(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const numero = String(req.params["numero"]).toUpperCase();
    const row = await getBonCarburantByNumero(numero);

    if (!row) {
      res.status(404).json({ erreur: "Bon introuvable" });
      return;
    }

    const b = row.bon;
    res.json({
      id: b.id,
      numero: b.numero,
      statut: b.statut,
      type_carburant: b.typeCarburant,
      quantite_autorisee: parseFloat(b.quantiteAutorisee),
      station_service: b.stationService ?? null,
      motif: b.motif ?? null,
      date_emission: b.dateEmission,
      immatriculation: row.immatriculation ?? null,
      marque: row.marque ?? null,
      modele: row.modele ?? null,
      chauffeur_nom: row.chauffeurNom
        ? `${row.chauffeurPrenoms ?? ""} ${row.chauffeurNom}`.trim()
        : null,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur verifierBonStation");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── PUT /station/carburant/bons/:numero/livrer ────────────────────────────────
// Enregistre la délivrance du carburant par la station.
export async function handleLivrerBonStation(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const numero = String(req.params["numero"]).toUpperCase();
    const row = await getBonCarburantByNumero(numero);

    if (!row) {
      res.status(404).json({ erreur: "Bon introuvable" });
      return;
    }
    if (row.bon.statut !== "approuve") {
      res.status(400).json({
        erreur:
          row.bon.statut === "utilise"
            ? "Ce bon a déjà été utilisé"
            : "Ce bon n'est pas encore approuvé",
      });
      return;
    }

    const MODES_VALIDES = ["especes", "cheque", "virement", "orange_money", "mtn_momo", "wave"] as const;
    type ModePaiement = typeof MODES_VALIDES[number];

    const body = req.body as {
      quantite_livree: number;
      prix_litre_fcfa?: number;
      montant_fcfa?: number;
      date_utilisation: string;
      station_service?: string;
      observations?: string;
      ticket_url?: string;
      qr_payload?: string;
      qr_sig?: string;
      mode_paiement?: string;
    };

    // Valider explicitement le mode si fourni ; sinon espèces par défaut
    if (body.mode_paiement && !(MODES_VALIDES as readonly string[]).includes(body.mode_paiement)) {
      res.status(400).json({
        erreur: `Mode de paiement invalide. Valeurs acceptées : ${MODES_VALIDES.join(", ")}.`,
      });
      return;
    }
    const modePaiement: ModePaiement = body.mode_paiement
      ? (body.mode_paiement as ModePaiement)
      : "especes";

    // Le QR code signé est obligatoire — c'est la preuve d'autorisation du chauffeur
    if (!body.qr_payload || !body.qr_sig) {
      res.status(400).json({
        erreur: "Un QR code signé est requis pour livrer un bon",
      });
      return;
    }
    if (!verifyQrPayload(body.qr_payload, body.qr_sig)) {
      res.status(400).json({ erreur: "Signature QR invalide ou falsifiée" });
      return;
    }
    try {
      const decoded = JSON.parse(
        Buffer.from(body.qr_payload, "base64url").toString("utf8"),
      ) as { exp?: unknown; num?: unknown };

      // exp doit être un nombre fini et dans le futur — fail-closed si absent ou NaN
      if (typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp)) {
        res.status(400).json({ erreur: "Payload QR invalide — champ exp manquant ou non numérique" });
        return;
      }
      if (decoded.exp <= Date.now()) {
        res.status(400).json({ erreur: "QR code expiré — demandez un nouveau bon" });
        return;
      }

      // num doit correspondre exactement au bon demandé — fail-closed si absent
      if (typeof decoded.num !== "string" || !decoded.num) {
        res.status(400).json({ erreur: "Payload QR invalide — champ num manquant" });
        return;
      }
      if (decoded.num !== numero) {
        res.status(400).json({ erreur: "Le QR code ne correspond pas au bon demandé" });
        return;
      }
    } catch {
      res.status(400).json({ erreur: "Payload QR illisible" });
      return;
    }

    if (!body.quantite_livree || !body.date_utilisation) {
      res
        .status(400)
        .json({ erreur: "quantite_livree et date_utilisation requis" });
      return;
    }

    const montant =
      body.montant_fcfa != null
        ? body.montant_fcfa
        : body.prix_litre_fcfa != null
          ? Math.round(body.quantite_livree * body.prix_litre_fcfa)
          : null;

    const extra: Record<string, unknown> = {
      quantiteLivree: String(body.quantite_livree),
      dateUtilisation: body.date_utilisation,
    };
    if (body.prix_litre_fcfa != null)
      extra["prixLitreFcfa"] = String(body.prix_litre_fcfa);
    if (montant != null) extra["montantFcfa"] = String(montant);
    if (body.station_service) extra["stationService"] = body.station_service;
    if (body.observations) extra["observations"] = body.observations;
    if (body.ticket_url) extra["ticketUrl"] = body.ticket_url;

    await transitionBon(row.bon.cooperativeId, row.bon.id, "utilise", extra);

    // Dépense véhicule (suivi consommation) + paiement en attente (validé dans ReglementsPage)
    if (montant && montant > 0) {
      try {
        await createDepense(
          row.bon.cooperativeId,
          row.bon.vehiculeId,
          {
            type: "carburant",
            dateDepense: body.date_utilisation,
            montantFcfa: String(montant),
            libelle: `Carburant — Bon ${row.bon.numero}`,
            fournisseur: body.station_service ?? row.bon.stationService ?? null,
            referencePiece: row.bon.numero,
            quantite: String(body.quantite_livree),
            unite: "L",
            missionId: null,
          },
        );
        // Créer un règlement en attente — sera validé depuis ReglementsPage
        await db.insert(paiementsTable).values({
          bonCarburantId: row.bon.id,
          montantFcfa: Math.round(montant),
          modePaiement: modePaiement,
          statut: "en_attente",
        });
      } catch (err) {
        req.log.warn({ err }, "Paiement carburant station création échouée");
      }
    }

    res.json({ success: true, statut: "utilise", numero: row.bon.numero });
  } catch (err) {
    req.log.error({ err }, "Erreur livrerBonStation");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
