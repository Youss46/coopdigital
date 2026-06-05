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
} from "../services/transportService";

function toDateStr(d: Date | null | undefined): string | null | undefined {
  if (d == null) return d;
  return d instanceof Date ? d.toISOString().split("T")[0] : String(d);
}

// ─── VÉHICULES ────────────────────────────────────────────────────────────────

export async function handleGetVehicules(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const list = await getVehicules(cooperativeId);
    res.json({ vehicules: list });
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

    res.status(201).json(vehicule);
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
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur updateVehicule");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetAlertes(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const [alertesV, alertesC] = await Promise.all([
      getAlertes(cooperativeId),
      getAlertesChauffeurs(cooperativeId),
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

    res.status(201).json(entretien);
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
    res.json({ entretiens: list });
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
    res.json({ chauffeurs: await getChauffeurs(cooperativeId) });
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

    res.status(201).json(chauffeur);
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
    res.json(updated);
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
    res.json({ missions: list });
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

    res.status(201).json(mission);
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
    res.json(updated);
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
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur terminerMission");
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
