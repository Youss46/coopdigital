/**
 * Contrôleur terrain pour le rôle "chauffeur".
 * Donne accès aux missions de transport et bons de carburant qui lui sont assignés.
 */
import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  missionsTransportTable,
  vehiculesTable,
  bonsCarburantTable,
  chauffeursTable,
  depensesVehiculeTable,
  stationsCarburantTable,
  paiementsTable,
} from "@workspace/db";
import { and, eq, desc, inArray, isNotNull } from "drizzle-orm";
import { createDemandeBon, getVehicules } from "../services/transportService.js";
import { notifDemandeCarburant } from "../services/notificationService.js";

function cooperativeId(req: Request): number | null {
  return req.agent?.cooperativeId ?? null;
}
function chauffeurId(req: Request): number | null {
  return (req.agent as { chauffeurId?: number | null } & typeof req.agent)?.chauffeurId ?? null;
}

// ─── Missions de transport ────────────────────────────────────────────────────

export async function getChauffeurMissions(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const chId   = chauffeurId(req);
    if (!coopId)  { res.status(401).json({ erreur: "Non autorisé" }); return; }
    if (!chId)    { res.status(400).json({ erreur: "Compte chauffeur non rattaché à un chauffeur" }); return; }

    const statut = req.query["statut"] as string | undefined;
    const conditions = [
      eq(missionsTransportTable.cooperativeId, coopId),
      eq(missionsTransportTable.chauffeurId,   chId),
    ];
    if (statut) conditions.push(eq(missionsTransportTable.statut, statut as "planifiee" | "en_cours" | "terminee" | "annulee"));

    const missions = await db
      .select({
        mission: missionsTransportTable,
        immatriculation: vehiculesTable.immatriculation,
        marque:          vehiculesTable.marque,
        modele:          vehiculesTable.modele,
      })
      .from(missionsTransportTable)
      .leftJoin(vehiculesTable, eq(vehiculesTable.id, missionsTransportTable.vehiculeId))
      .where(and(...conditions))
      .orderBy(desc(missionsTransportTable.dateDepart));

    res.json({
      missions: missions.map(m => ({
        id:               m.mission.id,
        cooperative_id:   m.mission.cooperativeId,
        vehicule_id:      m.mission.vehiculeId,
        immatriculation:  m.immatriculation ?? null,
        marque:           m.marque ?? null,
        modele:           m.modele ?? null,
        type_mission:     m.mission.typeMission,
        lieu_depart:      m.mission.lieuDepart,
        lieu_arrivee:     m.mission.lieuArrivee,
        date_depart:      m.mission.dateDepart.toISOString(),
        date_arrivee_prevue: m.mission.dateArriveePrevue?.toISOString() ?? null,
        date_arrivee_reelle: m.mission.dateArriveeReelle?.toISOString() ?? null,
        statut:           m.mission.statut,
        zone_collecte:    m.mission.zoneCollecte ?? null,
        section:          m.mission.section ?? null,
        observations:     m.mission.observations ?? null,
        cout_fcfa:        m.mission.coutFcfa != null ? parseFloat(m.mission.coutFcfa) : null,
        created_at:       m.mission.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "getChauffeurMissions");
    res.status(500).json({ erreur: apiError(err) });
  }
}

// ─── Bons de carburant ────────────────────────────────────────────────────────

export async function getChauffeurBons(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const chId   = chauffeurId(req);
    if (!coopId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
    if (!chId)   { res.status(400).json({ erreur: "Compte non rattaché à un chauffeur" }); return; }

    const statut = req.query["statut"] as string | undefined;
    const conditions = [
      eq(bonsCarburantTable.cooperativeId, coopId),
      eq(bonsCarburantTable.chauffeurId,   chId),
    ];
    if (statut) {
      const statuts = statut.split(",");
      if (statuts.length === 1) {
        conditions.push(eq(bonsCarburantTable.statut, statuts[0]! as "brouillon" | "soumis" | "approuve" | "utilise" | "annule"));
      } else {
        conditions.push(inArray(bonsCarburantTable.statut, statuts as ("brouillon" | "soumis" | "approuve" | "utilise" | "annule")[]));
      }
    }

    const bons = await db
      .select({
        bon:            bonsCarburantTable,
        immatriculation: vehiculesTable.immatriculation,
        marque:          vehiculesTable.marque,
      })
      .from(bonsCarburantTable)
      .leftJoin(vehiculesTable, eq(vehiculesTable.id, bonsCarburantTable.vehiculeId))
      .where(and(...conditions))
      .orderBy(desc(bonsCarburantTable.createdAt));

    res.json({
      bons: bons.map(({ bon, immatriculation, marque }) => ({
        id:                 bon.id,
        numero:             bon.numero,
        statut:             bon.statut,
        type_carburant:     bon.typeCarburant,
        quantite_autorisee: bon.quantiteAutorisee != null ? parseFloat(bon.quantiteAutorisee) : 0,
        quantite_livree:    bon.quantiteLivree    != null ? parseFloat(bon.quantiteLivree)    : null,
        prix_litre_fcfa:    bon.prixLitreFcfa     != null ? parseFloat(bon.prixLitreFcfa)     : null,
        montant_fcfa:       bon.montantFcfa        != null ? parseFloat(bon.montantFcfa)        : null,
        station_service:    bon.stationService  ?? null,
        motif:              bon.motif           ?? null,
        observations:       bon.observations    ?? null,
        date_emission:      bon.dateEmission,
        date_utilisation:   bon.dateUtilisation ?? null,
        vehicule_id:        bon.vehiculeId,
        immatriculation:    immatriculation     ?? null,
        marque:             marque              ?? null,
        created_at:         bon.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "getChauffeurBons");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function utiliserBonChauffeur(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const chId   = chauffeurId(req);
    if (!coopId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
    if (!chId)   { res.status(400).json({ erreur: "Compte non rattaché à un chauffeur" }); return; }

    const bonId = parseInt(String(req.params["id"]));
    if (isNaN(bonId)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    // Vérifier que le bon appartient bien à ce chauffeur et est approuvé
    const [bon] = await db
      .select()
      .from(bonsCarburantTable)
      .where(and(
        eq(bonsCarburantTable.id,            bonId),
        eq(bonsCarburantTable.cooperativeId, coopId),
        eq(bonsCarburantTable.chauffeurId,   chId),
      ))
      .limit(1);

    if (!bon) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    if (bon.statut !== "approuve") { res.status(400).json({ erreur: "Ce bon n'est pas encore approuvé" }); return; }

    const MODES_VALIDES = ["especes", "cheque", "virement", "orange_money", "mtn_momo", "wave"] as const;
    type ModePaiement = typeof MODES_VALIDES[number];

    const body = req.body as { quantite_livree: number; prix_litre_fcfa?: number; date_utilisation: string; station_service?: string; observations?: string; mode_paiement?: string };
    if (!body.quantite_livree || !body.date_utilisation) {
      res.status(400).json({ erreur: "quantite_livree et date_utilisation requis" }); return;
    }

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

    const montant = body.prix_litre_fcfa
      ? Math.round(body.quantite_livree * body.prix_litre_fcfa)
      : null;

    const [updated] = await db
      .update(bonsCarburantTable)
      .set({
        statut:          "utilise",
        quantiteLivree:  String(body.quantite_livree),
        dateUtilisation: body.date_utilisation,
        ...(body.prix_litre_fcfa  ? { prixLitreFcfa: String(body.prix_litre_fcfa) } : {}),
        ...(montant != null        ? { montantFcfa:   String(montant) }               : {}),
        ...(body.station_service   ? { stationService: body.station_service }         : {}),
        ...(body.observations      ? { observations: body.observations }              : {}),
        updatedAt: new Date(),
      })
      .where(and(
        eq(bonsCarburantTable.id,            bonId),
        eq(bonsCarburantTable.cooperativeId, coopId),
        eq(bonsCarburantTable.chauffeurId,   chId),
      ))
      .returning();

    // Dépense véhicule automatique (suivi consommation)
    if (montant && montant > 0) {
      await db.insert(depensesVehiculeTable).values({
        cooperativeId: coopId,
        vehiculeId:    bon.vehiculeId,
        type:          "carburant",
        dateDepense:   body.date_utilisation,
        montantFcfa:   String(montant),
        libelle:       `Carburant — Bon ${bon.numero}`,
        fournisseur:   body.station_service ?? bon.stationService ?? null,
        referencePiece: bon.numero,
        quantite:      String(body.quantite_livree),
        unite:         "L",
      });
      // Créer un règlement en attente — sera validé depuis ReglementsPage
      await db.insert(paiementsTable).values({
        bonCarburantId: bon.id,
        montantFcfa:    montant,
        modePaiement:   modePaiement,
        statut:         "en_attente",
      });
    }

    res.json({ ...updated, message: "Utilisation enregistrée avec succès" });
  } catch (err) {
    req.log.error({ err }, "utiliserBonChauffeur");
    res.status(500).json({ erreur: apiError(err) });
  }
}

// ─── Accueil (résumé du jour) ─────────────────────────────────────────────────

export async function getChauffeurAccueil(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const chId   = chauffeurId(req);
    if (!coopId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

    const missionsEnCours = chId ? await db
      .select({
        id:          missionsTransportTable.id,
        typeMission: missionsTransportTable.typeMission,
        lieuDepart:  missionsTransportTable.lieuDepart,
        lieuArrivee: missionsTransportTable.lieuArrivee,
        dateDepart:  missionsTransportTable.dateDepart,
        statut:      missionsTransportTable.statut,
        immatriculation: vehiculesTable.immatriculation,
        marque:          vehiculesTable.marque,
      })
      .from(missionsTransportTable)
      .leftJoin(vehiculesTable, eq(vehiculesTable.id, missionsTransportTable.vehiculeId))
      .where(and(
        eq(missionsTransportTable.cooperativeId, coopId),
        eq(missionsTransportTable.chauffeurId,   chId),
        inArray(missionsTransportTable.statut, ["planifiee", "en_cours"]),
      ))
      .orderBy(missionsTransportTable.dateDepart)
      .limit(5) : [];

    const bonsEnAttente = chId ? await db
      .select({
        id:               bonsCarburantTable.id,
        numero:           bonsCarburantTable.numero,
        typeCarburant:    bonsCarburantTable.typeCarburant,
        quantiteAutorisee: bonsCarburantTable.quantiteAutorisee,
        stationService:   bonsCarburantTable.stationService,
        immatriculation:  vehiculesTable.immatriculation,
      })
      .from(bonsCarburantTable)
      .leftJoin(vehiculesTable, eq(vehiculesTable.id, bonsCarburantTable.vehiculeId))
      .where(and(
        eq(bonsCarburantTable.cooperativeId, coopId),
        eq(bonsCarburantTable.chauffeurId,   chId),
        eq(bonsCarburantTable.statut, "approuve"),
      ))
      .orderBy(desc(bonsCarburantTable.createdAt))
      .limit(5) : [];

    // Statistiques de consommation (bons déjà utilisés)
    const bonsUtilises = chId ? await db
      .select({
        quantiteAutorisee: bonsCarburantTable.quantiteAutorisee,
        quantiteLivree:    bonsCarburantTable.quantiteLivree,
      })
      .from(bonsCarburantTable)
      .where(and(
        eq(bonsCarburantTable.cooperativeId, coopId),
        eq(bonsCarburantTable.chauffeurId,   chId),
        eq(bonsCarburantTable.statut, "utilise"),
      )) : [];

    const litresConsommes = bonsUtilises.reduce((s, b) => {
      const q = b.quantiteLivree ?? b.quantiteAutorisee;
      return s + (q != null ? parseFloat(String(q)) : 0);
    }, 0);

    res.json({
      missions_en_cours:  missionsEnCours.map(m => ({
        id:             m.id,
        type_mission:   m.typeMission,
        lieu_depart:    m.lieuDepart,
        lieu_arrivee:   m.lieuArrivee,
        date_depart:    m.dateDepart.toISOString(),
        statut:         m.statut,
        immatriculation: m.immatriculation ?? null,
        marque:         m.marque ?? null,
      })),
      bons_en_attente: bonsEnAttente.map(b => ({
        id:               b.id,
        numero:           b.numero,
        type_carburant:   b.typeCarburant,
        quantite_autorisee: b.quantiteAutorisee != null ? parseFloat(b.quantiteAutorisee) : 0,
        station_service:  b.stationService ?? null,
        immatriculation:  b.immatriculation ?? null,
      })),
      litres_consommes:    Math.round(litresConsommes * 10) / 10,
      bons_utilises_count: bonsUtilises.length,
      chauffeur_rattache: chId != null,
    });
  } catch (err) {
    req.log.error({ err }, "getChauffeurAccueil");
    res.status(500).json({ erreur: apiError(err) });
  }
}

// ─── Stations-service connues ─────────────────────────────────────────────────

export async function getChauffeurStations(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    if (!coopId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

    // Toutes les paires (station, type_carburant) utilisées par la coopérative
    const rows = await db
      .selectDistinct({
        nom:           bonsCarburantTable.stationService,
        typeCarburant: bonsCarburantTable.typeCarburant,
      })
      .from(bonsCarburantTable)
      .where(
        and(
          eq(bonsCarburantTable.cooperativeId, coopId),
          isNotNull(bonsCarburantTable.stationService),
        ),
      )
      .orderBy(bonsCarburantTable.stationService);

    // Agréger les types de carburant par station (bons historiques)
    const map = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!r.nom) continue;
      if (!map.has(r.nom)) map.set(r.nom, new Set());
      map.get(r.nom)!.add(r.typeCarburant);
    }

    // Fusionner avec les stations pré-configurées par le gestionnaire
    const dbStations = await db
      .select()
      .from(stationsCarburantTable)
      .where(
        and(
          eq(stationsCarburantTable.cooperativeId, coopId),
          eq(stationsCarburantTable.actif, true),
        ),
      )
      .orderBy(stationsCarburantTable.nom);

    // Mémoriser les coordonnées GPS par nom de station
    const coords = new Map<string, { latitude: number | null; longitude: number | null }>();

    for (const s of dbStations) {
      const types = s.typesCarburant.split(",").map((t: string) => t.trim()).filter(Boolean);
      if (!map.has(s.nom)) map.set(s.nom, new Set());
      for (const t of types) map.get(s.nom)!.add(t);
      coords.set(s.nom, {
        latitude:  s.latitude  != null ? Number(s.latitude)  : null,
        longitude: s.longitude != null ? Number(s.longitude) : null,
      });
    }

    res.json({
      stations: [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b, "fr"))
        .map(([nom, types]) => ({
          nom,
          types_carburant: [...types].sort(),
          latitude:  coords.get(nom)?.latitude  ?? null,
          longitude: coords.get(nom)?.longitude ?? null,
        })),
    });
  } catch (err) {
    req.log.error({ err }, "getChauffeurStations");
    res.status(500).json({ erreur: apiError(err) });
  }
}

// ─── Véhicules disponibles (pour formulaire demande) ──────────────────────────

export async function getChauffeurVehicules(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    if (!coopId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
    const vehicules = await getVehicules(coopId);
    res.json({
      vehicules: vehicules
        .filter(v => v.statut !== "hors_service")
        .map(v => ({
          id:             v.id,
          immatriculation: v.immatriculation,
          marque:         v.marque ?? null,
          modele:         v.modele ?? null,
        })),
    });
  } catch (err) {
    req.log.error({ err }, "getChauffeurVehicules");
    res.status(500).json({ erreur: apiError(err) });
  }
}

// ─── Créer une demande de carburant depuis le terrain ────────────────────────

export async function creerDemandeCarburant(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const chId   = chauffeurId(req);
    const agentId = req.agent?.id;
    if (!coopId || !agentId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
    if (!chId) { res.status(400).json({ erreur: "Compte non rattaché à un chauffeur" }); return; }

    const body = req.body as {
      vehicule_id: number;
      type_carburant?: string;
      quantite_demandee?: number;
      motif?: string;
      station_service?: string;
    };
    if (!body.vehicule_id) { res.status(400).json({ erreur: "Véhicule requis" }); return; }

    const today = new Date().toISOString().split("T")[0]!;
    const bon = await createDemandeBon(coopId, agentId, {
      vehiculeId:        body.vehicule_id,
      chauffeurId:       chId,
      typeCarburant:     body.type_carburant ?? "gasoil",
      quantiteAutorisee: body.quantite_demandee ? String(body.quantite_demandee) : "0",
      stationService:    body.station_service ?? null,
      motif:             body.motif ?? null,
      dateEmission:      today,
    });

    // Récupérer nom chauffeur pour la notification
    const [ch] = await db
      .select({ nom: chauffeursTable.nom, prenoms: chauffeursTable.prenoms })
      .from(chauffeursTable)
      .where(eq(chauffeursTable.id, chId));
    const nomChauffeur = `${ch?.prenoms ?? ""} ${ch?.nom ?? ""}`.trim() || "Chauffeur";

    void notifDemandeCarburant(coopId, bon.numero, nomChauffeur, bon.id);

    res.status(201).json({ id: bon.id, numero: bon.numero, statut: bon.statut });
  } catch (err) {
    req.log.error({ err }, "creerDemandeCarburant");
    res.status(500).json({ erreur: apiError(err) });
  }
}
