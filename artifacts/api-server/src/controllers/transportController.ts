import { type Request, type Response } from "express";
import {
  CreateVehiculeBody,
  UpdateVehiculeBody,
  CreateChauffeurBody,
  UpdateChauffeurBody,
  CreateMissionBody,
  TerminerMissionBody,
  CreateEntretienVehiculeBody,
} from "@workspace/api-zod";
import { proposerEcriture } from "../services/comptabiliteService";
import { envoyerPushGroupe } from "../services/pushService";
import { notifBonSoumisCarburant } from "../services/notificationService";
import {
  getVehicules,
  getVehicule,
  createVehicule,
  updateVehicule,
  getAlertes,
  getAlertesChauffeurs,
  createEntretien,
  getEntretiens,
  getChauffeurs,
  getChauffeur,
  createChauffeur,
  updateChauffeur,
  deleteChauffeur,
  getMissions,
  createMission,
  demarrerMission,
  terminerMission,
  getRapportCampagne,
  getRapportVehicule,
  getDepenses,
  createDepense,
  updateDepense,
  deleteDepense,
  getBonsCarburant,
  getBonCarburant,
  createBonCarburant,
  transitionBon,
  getStatsCarburant,
} from "../services/transportService";
import { generateBonCarburant } from "../services/bonCarburantPdf";
import { db, usersTable, stationsCarburantTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

function toDateStr(d: Date | null | undefined): string | null | undefined {
  if (d == null) return d;
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
}

// ─── Mappers Drizzle (camelCase) → API snake_case ────────────────────────────

type DrizzleVehicule = Awaited<ReturnType<typeof getVehicules>>[number];
type DrizzleChauffeur = Awaited<ReturnType<typeof getChauffeurs>>[number];
type DrizzleMission = Awaited<ReturnType<typeof getMissions>>[number]["mission"];

function mapVehicule(v: DrizzleVehicule) {
  return {
    id: v.id,
    cooperative_id: v.cooperativeId,
    immatriculation: v.immatriculation,
    marque: v.marque,
    modele: v.modele,
    type: v.type,
    capacite_kg: v.capaciteKg != null ? Number(v.capaciteKg) : null,
    annee_fabrication: v.anneeFabrication,
    date_acquisition: v.dateAcquisition,
    valeur_acquisition_fcfa: v.valeurAcquisitionFcfa != null ? Number(v.valeurAcquisitionFcfa) : null,
    proprietaire: v.proprietaire,
    nom_prestataire: v.nomPrestataire,
    statut: v.statut,
    kilometrage_actuel: v.kilometrageActuel ?? 0,
    prochain_entretien_km: v.prochainEntretienKm,
    prochain_entretien_date: v.prochainEntretienDate,
    assurance_expiration: v.assuranceExpiration,
    visite_technique_expiration: v.visiteTechniqueExpiration,
    photo_url: v.photoUrl,
    created_at: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    updated_at: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : String(v.updatedAt),
  };
}

function mapChauffeur(c: DrizzleChauffeur) {
  return {
    id: c.id,
    cooperative_id: c.cooperativeId,
    nom: c.nom,
    prenoms: c.prenoms,
    telephone: c.telephone,
    numero_permis: c.numeroPermis,
    categorie_permis: c.categoriePermis,
    date_expiration_permis: c.dateExpirationPermis,
    date_embauche: c.dateEmbauche,
    statut: c.statut,
    created_at: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
  };
}

type DrizzleEntretien = Awaited<ReturnType<typeof getEntretiens>>[number];

function mapEntretien(e: DrizzleEntretien) {
  return {
    id: e.id,
    vehicule_id: e.vehiculeId,
    type_entretien: e.typeEntretien,
    date_entretien: e.dateEntretien,
    kilometrage_entretien: e.kilometrageEntretien,
    description: e.description,
    cout_fcfa: e.coutFcfa != null ? Number(e.coutFcfa) : null,
    garage: e.garage,
    prochain_entretien_km: e.prochainEntretienKm,
    prochain_entretien_date: e.prochainEntretienDate,
    created_at: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
  };
}

function mapMission(m: DrizzleMission) {
  return {
    id: m.id,
    cooperative_id: m.cooperativeId,
    vehicule_id: m.vehiculeId,
    chauffeur_id: m.chauffeurId,
    campagne_id: m.campagneId,
    type_mission: m.typeMission,
    zone_collecte: m.zoneCollecte,
    section: m.section,
    vente_exportateur_id: m.venteExportateurId,
    exportateur_destination: m.exportateurDestination,
    lieu_depart: m.lieuDepart,
    lieu_arrivee: m.lieuArrivee,
    date_depart: m.dateDepart instanceof Date ? m.dateDepart.toISOString() : String(m.dateDepart),
    date_arrivee_prevue: m.dateArriveePrevue instanceof Date ? m.dateArriveePrevue.toISOString() : (m.dateArriveePrevue ?? null),
    date_arrivee_reelle: m.dateArriveeReelle instanceof Date ? m.dateArriveeReelle.toISOString() : (m.dateArriveeReelle ?? null),
    poids_charge_kg: m.poidsChargeKg != null ? Number(m.poidsChargeKg) : 0,
    nombre_sacs: m.nombreSacs ?? 0,
    kilometrage_depart: m.kilometrageDepart,
    kilometrage_arrivee: m.kilometrageArrivee,
    distance_km: m.distanceKm,
    cout_carburant_fcfa: m.coutCarburantFcfa != null ? Number(m.coutCarburantFcfa) : 0,
    cout_chauffeur_fcfa: m.coutChauffeurFcfa != null ? Number(m.coutChauffeurFcfa) : 0,
    cout_peage_fcfa: m.coutPeageFcfa != null ? Number(m.coutPeageFcfa) : 0,
    cout_divers_fcfa: m.coutDiversFcfa != null ? Number(m.coutDiversFcfa) : 0,
    cout_total_fcfa: m.coutTotalFcfa != null ? Number(m.coutTotalFcfa) : 0,
    cout_par_kg_fcfa: m.coutParKgFcfa != null ? Number(m.coutParKgFcfa) : null,
    statut: m.statut,
    observations: m.observations,
    created_at: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
    updated_at: m.updatedAt instanceof Date ? m.updatedAt.toISOString() : String(m.updatedAt),
  };
}

// ─── VÉHICULES ────────────────────────────────────────────────────────────────

export async function handleGetVehicules(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const list = await getVehicules(cooperativeId);
    res.json({ vehicules: list.map(mapVehicule) });
  } catch (err) {
    req.log.error({ err }, "Erreur getVehicules");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateVehicule(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const parse = CreateVehiculeBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }

    const d = parse.data;
    const vehicule = await createVehicule(cooperativeId, {
      immatriculation:          d.immatriculation,
      marque:                   d.marque        ?? null,
      modele:                   d.modele        ?? null,
      type:                     d.type,
      capaciteKg:               d.capacite_kg         != null ? String(d.capacite_kg)         : null,
      anneeFabrication:         d.annee_fabrication   ?? null,
      dateAcquisition:          toDateStr(d.date_acquisition)          ?? null,
      valeurAcquisitionFcfa:    d.valeur_acquisition_fcfa != null ? String(d.valeur_acquisition_fcfa) : null,
      proprietaire:             d.proprietaire  ?? "cooperative",
      nomPrestataire:           d.nom_prestataire ?? null,
      statut:                   d.statut         ?? "disponible",
      kilometrageActuel:        d.kilometrage_actuel ?? 0,
      prochainEntretienKm:      d.prochain_entretien_km   ?? null,
      prochainEntretienDate:    toDateStr(d.prochain_entretien_date)    ?? null,
      assuranceExpiration:      toDateStr(d.assurance_expiration)       ?? null,
      visiteTechniqueExpiration: toDateStr(d.visite_technique_expiration) ?? null,
      photoUrl:                 d.photo_url     ?? null,
    });

    res.status(201).json(mapVehicule(vehicule));
  } catch (err) {
    req.log.error({ err }, "Erreur createVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUpdateVehicule(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const parse = UpdateVehiculeBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }

    const d = parse.data;
    const updated = await updateVehicule(cooperativeId, id, {
      ...(d.marque         != null && { marque:                  d.marque }),
      ...(d.modele         != null && { modele:                  d.modele }),
      ...(d.type           != null && { type:                    d.type }),
      ...(d.capacite_kg    != null && { capaciteKg:              String(d.capacite_kg) }),
      ...(d.proprietaire   != null && { proprietaire:            d.proprietaire }),
      ...(d.nom_prestataire != null && { nomPrestataire:         d.nom_prestataire }),
      ...(d.statut         != null && { statut:                  d.statut }),
      ...(d.kilometrage_actuel     != null && { kilometrageActuel:      d.kilometrage_actuel }),
      ...(d.prochain_entretien_km  != null && { prochainEntretienKm:    d.prochain_entretien_km }),
      ...(d.prochain_entretien_date != null && { prochainEntretienDate: toDateStr(d.prochain_entretien_date) ?? null }),
      ...(d.assurance_expiration   != null && { assuranceExpiration:    toDateStr(d.assurance_expiration)   ?? null }),
      ...(d.visite_technique_expiration != null && { visiteTechniqueExpiration: toDateStr(d.visite_technique_expiration) ?? null }),
      ...(d.photo_url      != null && { photoUrl:                d.photo_url }),
    });

    if (!updated) { res.status(404).json({ erreur: "Véhicule introuvable" }); return; }
    res.json(mapVehicule(updated));
  } catch (err) {
    req.log.error({ err }, "Erreur updateVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetAlertes(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const jours = typeof req.query["jours"] === "string" ? parseInt(req.query["jours"]) : 30;
    const joursAlerte = isNaN(jours) || jours < 1 ? 30 : Math.min(jours, 365);
    const [alertesV, alertesC] = await Promise.all([
      getAlertes(cooperativeId, joursAlerte),
      getAlertesChauffeurs(cooperativeId, joursAlerte),
    ]);
    res.json({ alertes_vehicules: alertesV, alertes_chauffeurs: alertesC });
  } catch (err) {
    req.log.error({ err }, "Erreur getAlertes");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateEntretien(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const vehiculeId = parseInt(String(req.params["id"]));
    if (isNaN(vehiculeId)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const vehicule = await getVehicule(cooperativeId, vehiculeId);
    if (!vehicule) { res.status(404).json({ erreur: "Véhicule introuvable" }); return; }

    const parse = CreateEntretienVehiculeBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }

    const d = parse.data;
    const entretien = await createEntretien(vehiculeId, {
      typeEntretien:          d.type_entretien,
      dateEntretien:          toDateStr(d.date_entretien) as string,
      kilometrageEntretien:   d.kilometrage_entretien   ?? null,
      description:            d.description             ?? null,
      coutFcfa:               d.cout_fcfa != null ? String(d.cout_fcfa) : null,
      garage:                 d.garage                  ?? null,
      prochainEntretienKm:    d.prochain_entretien_km   ?? null,
      prochainEntretienDate:  toDateStr(d.prochain_entretien_date) ?? null,
    });

    // Écriture comptable : frais entretien véhicule → 624 Entretien & réparations / 521 Banque
    if (d.cout_fcfa && d.cout_fcfa > 0) {
      const dateStr = toDateStr(d.date_entretien) as string;
      void proposerEcriture(cooperativeId, {
        source: "transport",
        sourceId: entretien.id,
        libelle: `Entretien véhicule – ${d.type_entretien}`,
        compteDebit:  "624",
        compteCredit: "521",
        montantFcfa:  Math.round(d.cout_fcfa),
        date:         dateStr,
        numeroPiece:  `ENT-${entretien.id}`,
      });
    }

    res.status(201).json(mapEntretien(entretien));
  } catch (err) {
    req.log.error({ err }, "Erreur createEntretien");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetEntretiens(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const vehiculeId = parseInt(String(req.params["id"]));
    if (isNaN(vehiculeId)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const vehicule = await getVehicule(cooperativeId, vehiculeId);
    if (!vehicule) { res.status(404).json({ erreur: "Véhicule introuvable" }); return; }

    const list = await getEntretiens(vehiculeId);
    res.json({ entretiens: list.map(mapEntretien) });
  } catch (err) {
    req.log.error({ err }, "Erreur getEntretiens");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── CHAUFFEURS ───────────────────────────────────────────────────────────────

export async function handleGetChauffeurs(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const list = await getChauffeurs(cooperativeId);
    res.json({ chauffeurs: list.map(mapChauffeur) });
  } catch (err) {
    req.log.error({ err }, "Erreur getChauffeurs");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateChauffeur(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const parse = CreateChauffeurBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }

    const d = parse.data;
    const chauffeur = await createChauffeur(cooperativeId, {
      nom:                   d.nom,
      prenoms:               d.prenoms                ?? null,
      telephone:             d.telephone              ?? null,
      numeroPermis:          d.numero_permis          ?? null,
      categoriePermis:       d.categorie_permis       ?? null,
      dateExpirationPermis:  toDateStr(d.date_expiration_permis) ?? null,
      dateEmbauche:          toDateStr(d.date_embauche)          ?? null,
      statut:                d.statut                 ?? "actif",
    });

    res.status(201).json(mapChauffeur(chauffeur));
  } catch (err) {
    req.log.error({ err }, "Erreur createChauffeur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUpdateChauffeur(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const parse = UpdateChauffeurBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }

    const d = parse.data;
    const updated = await updateChauffeur(cooperativeId, id, {
      ...(d.nom               != null && { nom:                  d.nom }),
      ...(d.prenoms           != null && { prenoms:              d.prenoms }),
      ...(d.telephone         != null && { telephone:            d.telephone }),
      ...(d.numero_permis     != null && { numeroPermis:         d.numero_permis }),
      ...(d.categorie_permis  != null && { categoriePermis:      d.categorie_permis }),
      ...(d.date_expiration_permis != null && { dateExpirationPermis: toDateStr(d.date_expiration_permis) ?? null }),
      ...(d.date_embauche     != null && { dateEmbauche:         toDateStr(d.date_embauche) ?? null }),
      ...(d.statut            != null && { statut:               d.statut }),
    });

    if (!updated) { res.status(404).json({ erreur: "Chauffeur introuvable" }); return; }
    res.json(mapChauffeur(updated));
  } catch (err) {
    req.log.error({ err }, "Erreur updateChauffeur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleDeleteChauffeur(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const ok = await deleteChauffeur(cooperativeId, id);
    if (!ok) { res.status(404).json({ erreur: "Chauffeur introuvable" }); return; }
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Erreur deleteChauffeur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── MISSIONS ─────────────────────────────────────────────────────────────────

export async function handleGetMissions(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const statut = typeof req.query["statut"] === "string" ? req.query["statut"] : undefined;
    const list = await getMissions(cooperativeId, statut);
    res.json({ missions: list.map((row) => mapMission(row.mission)) });
  } catch (err) {
    req.log.error({ err }, "Erreur getMissions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateMission(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const parse = CreateMissionBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }

    const d = parse.data;
    const mission = await createMission(cooperativeId, {
      vehiculeId:             d.vehicule_id,
      chauffeurId:            d.chauffeur_id,
      campagneId:             d.campagne_id             ?? null,
      typeMission:            d.type_mission,
      zoneCollecte:           d.zone_collecte           ?? null,
      section:                d.section                 ?? null,
      venteExportateurId:     d.vente_exportateur_id    ?? null,
      exportateurDestination: d.exportateur_destination ?? null,
      lieuDepart:             d.lieu_depart,
      lieuArrivee:            d.lieu_arrivee,
      dateDepart:             new Date(d.date_depart),
      dateArriveePrevue:      d.date_arrivee_prevue ? new Date(d.date_arrivee_prevue) : null,
      kilometrageDepart:      d.kilometrage_depart ?? null,
      observations:           d.observations       ?? null,
    });

    res.status(201).json(mapMission(mission));
  } catch (err) {
    req.log.error({ err }, "Erreur createMission");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleDemarrerMission(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const updated = await demarrerMission(cooperativeId, id);
    if (!updated) { res.status(404).json({ erreur: "Mission introuvable ou statut invalide" }); return; }
    res.json(mapMission(updated));
  } catch (err) {
    req.log.error({ err }, "Erreur demarrerMission");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleTerminerMission(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const parse = TerminerMissionBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }

    const d = parse.data;
    const updated = await terminerMission(cooperativeId, id, {
      dateArriveeReelle:    new Date(d.date_arrivee_reelle),
      kilometrageArrivee:   d.kilometrage_arrivee,
      coutCarburantFcfa:    d.cout_carburant_fcfa,
      coutChauffeurFcfa:    d.cout_chauffeur_fcfa,
      coutPeageFcfa:        d.cout_peage_fcfa,
      coutDiversFcfa:       d.cout_divers_fcfa  ?? 0,
      poidsChargeKg:        d.poids_charge_kg,
      observations:         d.observations      ?? undefined,
    });

    if (!updated) { res.status(404).json({ erreur: "Mission introuvable ou statut invalide" }); return; }
    const mappedMission = mapMission(updated);

    // Écritures comptables frais de mission transport
    const dateArrivee = new Date(d.date_arrivee_reelle).toISOString().slice(0, 10);
    const piece = `MISS-${id}`;
    if ((d.cout_carburant_fcfa ?? 0) > 0) {
      void proposerEcriture(cooperativeId, {
        source: "transport", sourceId: id,
        libelle: `Carburant mission #${id}`,
        compteDebit: "6042", compteCredit: "521",
        montantFcfa: Math.round(d.cout_carburant_fcfa!), date: dateArrivee, numeroPiece: piece,
      });
    }
    if ((d.cout_chauffeur_fcfa ?? 0) > 0) {
      void proposerEcriture(cooperativeId, {
        source: "transport", sourceId: id,
        libelle: `Rémunération chauffeur mission #${id}`,
        compteDebit: "637", compteCredit: "521",
        montantFcfa: Math.round(d.cout_chauffeur_fcfa!), date: dateArrivee, numeroPiece: piece,
      });
    }
    if ((d.cout_peage_fcfa ?? 0) > 0) {
      void proposerEcriture(cooperativeId, {
        source: "transport", sourceId: id,
        libelle: `Péages mission #${id}`,
        compteDebit: "618", compteCredit: "521",
        montantFcfa: Math.round(d.cout_peage_fcfa!), date: dateArrivee, numeroPiece: piece,
      });
    }
    if ((d.cout_divers_fcfa ?? 0) > 0) {
      void proposerEcriture(cooperativeId, {
        source: "transport", sourceId: id,
        libelle: `Frais divers mission #${id}`,
        compteDebit: "628", compteCredit: "521",
        montantFcfa: Math.round(d.cout_divers_fcfa!), date: dateArrivee, numeroPiece: piece,
      });
    }

    res.json(mappedMission);
  } catch (err) {
    req.log.error({ err }, "Erreur terminerMission");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── DÉPENSES VÉHICULES ───────────────────────────────────────────────────────

function mapDepense(d: { depense: { id: number; cooperativeId: number; vehiculeId: number; missionId: number | null; type: string; dateDepense: string; montantFcfa: string; libelle: string; fournisseur: string | null; referencePiece: string | null; quantite: string | null; unite: string | null; createdAt: Date; updatedAt: Date }; immatriculation: string | null | undefined }) {
  return {
    id:               d.depense.id,
    cooperative_id:   d.depense.cooperativeId,
    vehicule_id:      d.depense.vehiculeId,
    immatriculation:  d.immatriculation ?? null,
    mission_id:       d.depense.missionId ?? null,
    type:             d.depense.type,
    date_depense:     d.depense.dateDepense,
    montant_fcfa:     parseFloat(d.depense.montantFcfa),
    libelle:          d.depense.libelle,
    fournisseur:      d.depense.fournisseur ?? null,
    reference_piece:  d.depense.referencePiece ?? null,
    quantite:         d.depense.quantite != null ? parseFloat(d.depense.quantite) : null,
    unite:            d.depense.unite ?? null,
    created_at:       d.depense.createdAt.toISOString(),
    updated_at:       d.depense.updatedAt.toISOString(),
  };
}

export async function handleGetDepensesVehicule(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const vehiculeId = parseInt(String(req.params["id"]));
    if (isNaN(vehiculeId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const { type, date_debut, date_fin } = req.query as Record<string, string | undefined>;
    const { rows, total } = await getDepenses(cooperativeId, { vehiculeId, type, dateDebut: date_debut, dateFin: date_fin });
    res.json({ depenses: rows.map(mapDepense), total_fcfa: Math.round(total) });
  } catch (err) {
    req.log.error({ err }, "Erreur getDepensesVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetDepensesTransport(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const { vehicule_id, type, date_debut, date_fin } = req.query as Record<string, string | undefined>;
    const vehiculeId = vehicule_id ? parseInt(vehicule_id) : undefined;
    const { rows, total } = await getDepenses(cooperativeId, { vehiculeId, type, dateDebut: date_debut, dateFin: date_fin });
    res.json({ depenses: rows.map(mapDepense), total_fcfa: Math.round(total) });
  } catch (err) {
    req.log.error({ err }, "Erreur getDepensesTransport");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateDepenseVehicule(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const vehiculeId = parseInt(String(req.params["id"]));
    if (isNaN(vehiculeId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const body = req.body as { type: string; date_depense: string; montant_fcfa: number; libelle: string; mission_id?: number; fournisseur?: string; reference_piece?: string; quantite?: number; unite?: string };
    if (!body.type || !body.date_depense || body.montant_fcfa == null || !body.libelle) {
      res.status(400).json({ erreur: "Champs requis manquants" }); return;
    }
    const depense = await createDepense(cooperativeId, vehiculeId, {
      type:           body.type,
      dateDepense:    toDateStr(new Date(body.date_depense))!,
      montantFcfa:    String(body.montant_fcfa),
      libelle:        body.libelle,
      missionId:      body.mission_id ?? null,
      fournisseur:    body.fournisseur ?? null,
      referencePiece: body.reference_piece ?? null,
      quantite:       body.quantite != null ? String(body.quantite) : null,
      unite:          body.unite ?? null,
    });

    // Écriture comptable OHADA selon le type de dépense
    const compteDebitDepense: Record<string, string> = {
      carburant:      "6042", // Carburant et lubrifiant
      reparation:     "624",  // Entretien, réparations et maintenance
      piece_rechange: "624",  // Entretien, réparations et maintenance
      autre:          "628",  // Frais divers
    };
    const compteDebit = compteDebitDepense[body.type] ?? "628";
    if (body.montant_fcfa > 0) {
      void proposerEcriture(cooperativeId, {
        source: "transport", sourceId: depense.id,
        libelle: body.libelle,
        compteDebit, compteCredit: "521",
        montantFcfa: Math.round(body.montant_fcfa),
        date: toDateStr(new Date(body.date_depense))!,
        numeroPiece: `DEP-${depense.id}`,
      });
    }

    res.status(201).json(mapDepense({ depense, immatriculation: null }));
  } catch (err) {
    req.log.error({ err }, "Erreur createDepenseVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUpdateDepenseVehicule(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body["type"] != null)             patch["type"]           = body["type"];
    if (body["date_depense"] != null)     patch["dateDepense"]    = String(body["date_depense"]);
    if (body["montant_fcfa"] != null)     patch["montantFcfa"]    = String(body["montant_fcfa"]);
    if (body["libelle"] != null)          patch["libelle"]        = body["libelle"];
    if (body["mission_id"] !== undefined) patch["missionId"]      = body["mission_id"] ?? null;
    if (body["fournisseur"] !== undefined) patch["fournisseur"]   = body["fournisseur"] ?? null;
    if (body["reference_piece"] !== undefined) patch["referencePiece"] = body["reference_piece"] ?? null;
    if (body["quantite"] !== undefined)   patch["quantite"]       = body["quantite"] != null ? String(body["quantite"]) : null;
    if (body["unite"] !== undefined)      patch["unite"]          = body["unite"] ?? null;
    const updated = await updateDepense(cooperativeId, id, patch as Parameters<typeof updateDepense>[2]);
    if (!updated) { res.status(404).json({ erreur: "Dépense introuvable" }); return; }
    res.json(mapDepense({ depense: updated, immatriculation: null }));
  } catch (err) {
    req.log.error({ err }, "Erreur updateDepenseVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleDeleteDepenseVehicule(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const ok = await deleteDepense(cooperativeId, id);
    if (!ok) { res.status(404).json({ erreur: "Dépense introuvable" }); return; }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur deleteDepenseVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── BONS DE CARBURANT ────────────────────────────────────────────────────────

function mapBon(row: Awaited<ReturnType<typeof getBonsCarburant>>[number], approveParNom?: string | null) {
  const b = row.bon;
  return {
    id:                 b.id,
    cooperative_id:     b.cooperativeId,
    numero:             b.numero,
    vehicule_id:        b.vehiculeId,
    immatriculation:    row.immatriculation ?? null,
    marque:             row.marque ?? null,
    modele:             null,
    chauffeur_id:       b.chauffeurId ?? null,
    chauffeur_nom:      row.chauffeurNom ? `${row.chauffeurPrenoms ?? ""} ${row.chauffeurNom}`.trim() : null,
    type_carburant:     b.typeCarburant,
    quantite_autorisee: b.quantiteAutorisee != null ? parseFloat(b.quantiteAutorisee) : 0,
    station_service:    b.stationService ?? null,
    motif:              b.motif ?? null,
    date_emission:      b.dateEmission,
    statut:             b.statut,
    approuve_par:       b.approvePar ?? null,
    approuve_par_nom:   approveParNom ?? null,
    date_approbation:   b.dateApprobation?.toISOString() ?? null,
    date_utilisation:   b.dateUtilisation ?? null,
    quantite_livree:    b.quantiteLivree != null ? parseFloat(b.quantiteLivree) : null,
    prix_litre_fcfa:    b.prixLitreFcfa != null ? parseFloat(b.prixLitreFcfa) : null,
    montant_fcfa:       b.montantFcfa != null ? parseFloat(b.montantFcfa) : null,
    observations:       b.observations ?? null,
    ticket_url:         b.ticketUrl ?? null,
    created_at:         b.createdAt.toISOString(),
    updated_at:         b.updatedAt.toISOString(),
  };
}

async function getApproveNom(userId: number | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ nom: usersTable.nom, prenoms: usersTable.prenoms })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return u ? `${u.prenoms} ${u.nom}`.trim() : null;
}

export async function handleGetBonsCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const q = req.query as Record<string, string | undefined>;
    const rows = await getBonsCarburant(cooperativeId, {
      vehiculeId:  q["vehicule_id"]  ? parseInt(q["vehicule_id"])  : undefined,
      chauffeurId: q["chauffeur_id"] ? parseInt(q["chauffeur_id"]) : undefined,
      statut:      q["statut"],
      dateDebut:   q["date_debut"],
      dateFin:     q["date_fin"],
    });
    res.json({ bons: rows.map(r => mapBon(r)) });
  } catch (err) {
    req.log.error({ err }, "Erreur getBonsCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetBonCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const row = await getBonCarburant(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    const approveParNom = await getApproveNom(row.bon.approvePar);
    res.json(mapBon(row as Parameters<typeof mapBon>[0], approveParNom));
  } catch (err) {
    req.log.error({ err }, "Erreur getBonCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateBonCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const userId = req.user!.id;
    const body = req.body as { vehicule_id: number; chauffeur_id?: number; type_carburant: string; quantite_autorisee: number; station_service?: string; motif?: string; date_emission: string };
    if (!body.vehicule_id || !body.type_carburant || !body.quantite_autorisee || !body.date_emission) {
      res.status(400).json({ erreur: "Champs requis manquants" }); return;
    }
    const bon = await createBonCarburant(cooperativeId, userId, {
      vehiculeId:        body.vehicule_id,
      chauffeurId:       body.chauffeur_id ?? null,
      typeCarburant:     body.type_carburant,
      quantiteAutorisee: String(body.quantite_autorisee),
      stationService:    body.station_service ?? null,
      motif:             body.motif ?? null,
      dateEmission:      body.date_emission,
    });
    res.status(201).json({ ...bon, immatriculation: null, marque: null, modele: null, chauffeur_nom: null, approuve_par_nom: null });
  } catch (err) {
    req.log.error({ err }, "Erreur createBonCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleSoumettresBonCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const row = await getBonCarburant(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    if (row.bon.statut !== "brouillon") { res.status(400).json({ erreur: "Le bon n'est pas en brouillon" }); return; }
    await transitionBon(cooperativeId, id, "soumis");

    // Notification push + in-app → comptable/directeur (fire-and-forget)
    void notifBonSoumisCarburant(
      cooperativeId,
      row.bon.numero,
      `${row.chauffeurPrenoms ?? ""} ${row.chauffeurNom ?? ""}`.trim() || "Chauffeur",
      id,
    );

    res.json(mapBon({ ...row, bon: { ...row.bon, statut: "soumis", updatedAt: new Date() } }));
  } catch (err) {
    req.log.error({ err }, "Erreur soumettresBonCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleApprouverBonCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const userId = req.user!.id;
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const row = await getBonCarburant(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    if (row.bon.statut !== "soumis") { res.status(400).json({ erreur: "Le bon doit être soumis pour être approuvé" }); return; }
    await transitionBon(cooperativeId, id, "approuve", { approvePar: userId, dateApprobation: new Date() });

    // Push notification → chauffeur terrain (fire-and-forget)
    if (row.bon.chauffeurId != null) {
      void (async () => {
        try {
          const [chauffeurUser] = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.chauffeurId, row.bon.chauffeurId!))
            .limit(1);
          if (chauffeurUser) {
            await envoyerPushGroupe([chauffeurUser.id], {
              title: "Bon carburant approuvé ✓",
              body:  `Votre bon ${row.bon.numero} est approuvé — ouvrez l'app pour générer votre QR`,
              url:   "./bons-carburant",
            });
          }
        } catch (pushErr) {
          req.log.warn({ err: pushErr }, "Push notification bon approuvé échouée (non bloquant)");
        }
      })();
    }

    const approveParNom = await getApproveNom(userId);
    res.json(mapBon({ ...row, bon: { ...row.bon, statut: "approuve", approvePar: userId, dateApprobation: new Date(), updatedAt: new Date() } }, approveParNom));
  } catch (err) {
    req.log.error({ err }, "Erreur approuverBonCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUtiliserBonCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const row = await getBonCarburant(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    if (row.bon.statut !== "approuve") { res.status(400).json({ erreur: "Le bon doit être approuvé avant utilisation" }); return; }
    const body = req.body as { quantite_livree: number; prix_litre_fcfa?: number; montant_fcfa?: number; date_utilisation: string; station_service?: string; observations?: string };
    if (!body.quantite_livree || !body.date_utilisation) { res.status(400).json({ erreur: "quantite_livree et date_utilisation requis" }); return; }

    // Calcul montant si non fourni
    const montant = body.montant_fcfa != null ? body.montant_fcfa
      : (body.prix_litre_fcfa != null ? Math.round(body.quantite_livree * body.prix_litre_fcfa) : null);

    const extra: Record<string, unknown> = {
      quantiteLivree:  String(body.quantite_livree),
      dateUtilisation: body.date_utilisation,
    };
    if (body.prix_litre_fcfa != null) extra["prixLitreFcfa"] = String(body.prix_litre_fcfa);
    if (montant != null) extra["montantFcfa"] = String(montant);
    if (body.station_service)  extra["stationService"] = body.station_service;
    if (body.observations)     extra["observations"]   = body.observations;

    await transitionBon(cooperativeId, id, "utilise", extra);

    // Créer dépense automatiquement si montant connu + écriture comptable
    if (montant && montant > 0) {
      const { createDepense } = await import("../services/transportService");
      const depense = await createDepense(cooperativeId, row.bon.vehiculeId, {
        type:           "carburant",
        dateDepense:    body.date_utilisation,
        montantFcfa:    String(montant),
        libelle:        `Carburant — Bon ${row.bon.numero}`,
        fournisseur:    body.station_service ?? row.bon.stationService ?? null,
        referencePiece: row.bon.numero,
        quantite:       String(body.quantite_livree),
        unite:          "L",
        missionId:      null,
      });
      // Écriture OHADA : 6042 Carburant / 521 Caisse
      void proposerEcriture(cooperativeId, {
        source: "transport", sourceId: depense.id,
        libelle: `Carburant — Bon ${row.bon.numero} (${body.quantite_livree} L)`,
        compteDebit: "6042", compteCredit: "521",
        montantFcfa: Math.round(montant),
        date: body.date_utilisation,
        numeroPiece: row.bon.numero,
      });
    }

    res.json(mapBon({
      ...row,
      bon: { ...row.bon, statut: "utilise", quantiteLivree: String(body.quantite_livree), dateUtilisation: body.date_utilisation, updatedAt: new Date() },
    }));
  } catch (err) {
    req.log.error({ err }, "Erreur utiliserBonCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleAnnulerBonCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const row = await getBonCarburant(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    if (["utilise", "annule"].includes(row.bon.statut)) { res.status(400).json({ erreur: "Ce bon ne peut plus être annulé" }); return; }
    await transitionBon(cooperativeId, id, "annule");

    // Push notification → chauffeur (fire-and-forget)
    if (row.bon.chauffeurId) {
      void (async () => {
        try {
          const [userRow] = await db
            .select({ id: usersTable.id })
            .from(usersTable)
            .where(eq(usersTable.chauffeurId, row.bon.chauffeurId!))
            .limit(1);
          if (userRow) {
            await envoyerPushGroupe([userRow.id], {
              title: "Bon carburant annulé",
              body:  `Votre bon ${row.bon.numero} a été annulé. Contactez votre responsable.`,
              url:   "./bons-carburant",
            });
          }
        } catch (e) {
          req.log.error({ err: e }, "Push annulation bon carburant échoué");
        }
      })();
    }

    res.json(mapBon({ ...row, bon: { ...row.bon, statut: "annule", updatedAt: new Date() } }));
  } catch (err) {
    req.log.error({ err }, "Erreur annulerBonCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetBonCarburantPdf(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const row = await getBonCarburant(cooperativeId, id);
    if (!row) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    const b = row.bon;
    const approveParNom = await getApproveNom(b.approvePar);
    const pdfBuffer = await generateBonCarburant(cooperativeId, {
      id:               b.id,
      numero:           b.numero,
      statut:           b.statut,
      typeCarburant:    b.typeCarburant,
      quantiteAutorisee: b.quantiteAutorisee,
      quantiteLivree:   b.quantiteLivree,
      prixLitreFcfa:    b.prixLitreFcfa,
      montantFcfa:      b.montantFcfa,
      dateEmission:     b.dateEmission,
      dateUtilisation:  b.dateUtilisation,
      stationService:   b.stationService,
      motif:            b.motif,
      observations:     b.observations,
      immatriculation:  row.immatriculation ?? null,
      marque:           row.marque ?? null,
      modele:           row.modele ?? null,
      chauffeurNom:     row.chauffeurNom ?? null,
      chauffeurPrenoms: row.chauffeurPrenoms ?? null,
      approveParNom,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="bon-carburant-${b.numero}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    req.log.error({ err }, "Erreur getBonCarburantPdf");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetStatsCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const q = req.query as Record<string, string | undefined>;
    const stats = await getStatsCarburant(cooperativeId, {
      vehiculeId: q["vehicule_id"] ? parseInt(q["vehicule_id"]) : undefined,
      dateDebut:  q["date_debut"],
      dateFin:    q["date_fin"],
    });
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Erreur getStatsCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── RAPPORTS ─────────────────────────────────────────────────────────────────

export async function handleRapportCampagne(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const campagneId = req.query["campagne_id"] ? parseInt(String(req.query["campagne_id"])) : undefined;
    const rapport = await getRapportCampagne(cooperativeId, campagneId);
    res.json(rapport);
  } catch (err) {
    req.log.error({ err }, "Erreur rapportCampagne");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleRapportVehicule(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }

    const vehiculeId = parseInt(String(req.params["id"]));
    if (isNaN(vehiculeId)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const rapport = await getRapportVehicule(cooperativeId, vehiculeId);
    if (!rapport) { res.status(404).json({ erreur: "Véhicule introuvable" }); return; }
    res.json(rapport);
  } catch (err) {
    req.log.error({ err }, "Erreur rapportVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Stations-service (configuration admin) ──────────────────────────────────

export async function handleGetStationsCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const rows = await db
      .select()
      .from(stationsCarburantTable)
      .where(eq(stationsCarburantTable.cooperativeId, cooperativeId))
      .orderBy(stationsCarburantTable.nom);
    res.json({ stations: rows.map(s => ({
      id:              s.id,
      nom:             s.nom,
      adresse:         s.adresse ?? null,
      types_carburant: s.typesCarburant.split(",").map((t: string) => t.trim()).filter(Boolean),
      actif:           s.actif,
      created_at:      s.createdAt.toISOString(),
    })) });
  } catch (err) {
    req.log.error({ err }, "handleGetStationsCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateStationCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const body = req.body as { nom?: string; adresse?: string; types_carburant?: string[] };
    if (!body.nom?.trim()) { res.status(400).json({ erreur: "Le nom est requis" }); return; }
    const types = (body.types_carburant ?? ["gasoil"]).filter(Boolean).join(",");
    const [row] = await db.insert(stationsCarburantTable).values({
      cooperativeId,
      nom:            body.nom.trim(),
      adresse:        body.adresse?.trim() || null,
      typesCarburant: types || "gasoil",
    }).returning();
    res.status(201).json({ id: row!.id, nom: row!.nom, adresse: row!.adresse ?? null,
      types_carburant: row!.typesCarburant.split(",").filter(Boolean),
      actif: row!.actif });
  } catch (err) {
    req.log.error({ err }, "handleCreateStationCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUpdateStationCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const body = req.body as { nom?: string; adresse?: string; types_carburant?: string[]; actif?: boolean };
    const set: Partial<typeof stationsCarburantTable.$inferInsert> = { updatedAt: new Date() };
    if (body.nom !== undefined)             set.nom            = body.nom.trim();
    if (body.adresse !== undefined)         set.adresse        = body.adresse?.trim() || null;
    if (body.types_carburant !== undefined) set.typesCarburant = body.types_carburant.filter(Boolean).join(",") || "gasoil";
    if (body.actif !== undefined)           set.actif          = body.actif;
    const [row] = await db.update(stationsCarburantTable).set(set)
      .where(and(eq(stationsCarburantTable.id, id), eq(stationsCarburantTable.cooperativeId, cooperativeId)))
      .returning();
    if (!row) { res.status(404).json({ erreur: "Station introuvable" }); return; }
    res.json({ id: row.id, nom: row.nom, adresse: row.adresse ?? null,
      types_carburant: row.typesCarburant.split(",").filter(Boolean), actif: row.actif });
  } catch (err) {
    req.log.error({ err }, "handleUpdateStationCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleDeleteStationCarburant(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    await db.update(stationsCarburantTable)
      .set({ actif: false, updatedAt: new Date() })
      .where(and(eq(stationsCarburantTable.id, id), eq(stationsCarburantTable.cooperativeId, cooperativeId)));
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "handleDeleteStationCarburant");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
