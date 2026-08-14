/**
 * Contrôleurs publics pour l'espace station-service.
 * Ces endpoints ne requièrent PAS d'authentification coopérative :
 * le numéro du bon sert de jeton d'accès (unique par coopérative).
 */
import type { Request, Response } from "express";
import {
  getBonCarburantByNumero,
  transitionBon,
  createDepense,
} from "../services/transportService";

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
      id:                  b.id,
      numero:              b.numero,
      statut:              b.statut,
      type_carburant:      b.typeCarburant,
      quantite_autorisee:  parseFloat(b.quantiteAutorisee),
      station_service:     b.stationService ?? null,
      motif:               b.motif ?? null,
      date_emission:       b.dateEmission,
      immatriculation:     row.immatriculation ?? null,
      marque:              row.marque ?? null,
      modele:              row.modele ?? null,
      chauffeur_nom:       row.chauffeurNom
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

    const body = req.body as {
      quantite_livree: number;
      prix_litre_fcfa?: number;
      montant_fcfa?: number;
      date_utilisation: string;
      station_service?: string;
      observations?: string;
      ticket_url?: string;
    };

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
      quantiteLivree:  String(body.quantite_livree),
      dateUtilisation: body.date_utilisation,
    };
    if (body.prix_litre_fcfa != null)
      extra["prixLitreFcfa"] = String(body.prix_litre_fcfa);
    if (montant != null) extra["montantFcfa"] = String(montant);
    if (body.station_service) extra["stationService"] = body.station_service;
    if (body.observations)    extra["observations"]   = body.observations;
    if (body.ticket_url)      extra["ticketUrl"]      = body.ticket_url;

    await transitionBon(row.bon.cooperativeId, row.bon.id, "utilise", extra);

    // Dépense et écriture comptable OHADA si montant connu
    if (montant && montant > 0) {
      try {
        const depense = await createDepense(
          row.bon.cooperativeId,
          row.bon.vehiculeId,
          {
            type:           "carburant",
            dateDepense:    body.date_utilisation,
            montantFcfa:    String(montant),
            libelle:        `Carburant — Bon ${row.bon.numero}`,
            fournisseur:
              body.station_service ?? row.bon.stationService ?? null,
            referencePiece: row.bon.numero,
            quantite:       String(body.quantite_livree),
            unite:          "L",
            missionId:      null,
          },
        );
        const { proposerEcriture } = await import(
          "../services/comptabiliteService"
        );
        void proposerEcriture(row.bon.cooperativeId, {
          source:       "transport",
          sourceId:     depense.id,
          libelle:      `Carburant — Bon ${row.bon.numero} (${body.quantite_livree} L)`,
          compteDebit:  "6042",
          compteCredit: "521",
          montantFcfa:  Math.round(montant),
          date:         body.date_utilisation,
          numeroPiece:  row.bon.numero,
        });
      } catch (err) {
        // Ne pas bloquer la réponse si l'écriture comptable échoue
        req.log.warn({ err }, "Écriture comptable station carburant échouée");
      }
    }

    res.json({ success: true, statut: "utilise", numero: row.bon.numero });
  } catch (err) {
    req.log.error({ err }, "Erreur livrerBonStation");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
