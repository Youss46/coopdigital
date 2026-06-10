import { Router, type IRouter } from "express";
import { checkPermission } from "../middlewares/permissions";
import {
  listParcelles,
  getParcellesCarte,
  getParcelleById,
  createParcelle,
  updateParcelle,
  getParcellesMembre,
  getHistoriqueRendements,
  exportGeoJSONController,
  getConformite,
  importZonesRisque,
  verifierEUDRController,
  verifierTout,
  getGpsTerrain,
} from "../controllers/parcellesController";

const router: IRouter = Router();

router.get(  "/parcelles/gps-terrain",          checkPermission("parcelles", "voir_carte"),        getGpsTerrain);
router.get(  "/parcelles/carte",               checkPermission("parcelles", "voir_carte"),        getParcellesCarte);
router.get(  "/parcelles/export-geojson",       checkPermission("parcelles", "exporter_geojson"),  exportGeoJSONController);
router.get(  "/parcelles/conformite",           checkPermission("parcelles", "voir_carte"),        getConformite);
router.post( "/parcelles/verifier-tout",        checkPermission("parcelles", "verifier_eudr"),     verifierTout);
router.post( "/parcelles/import-zones-risque",  checkPermission("parcelles", "importer_zones"),    importZonesRisque);
router.get(  "/parcelles/membre/:membre_id",    checkPermission("parcelles", "voir_carte"),        getParcellesMembre);
router.get(  "/parcelles/:id/historique-rendements", checkPermission("parcelles", "voir_carte"),  getHistoriqueRendements);
router.put(  "/parcelles/:id/verifier-eudr",    checkPermission("parcelles", "verifier_eudr"),    verifierEUDRController);
router.get(  "/parcelles/:id",                  checkPermission("parcelles", "voir_carte"),        getParcelleById);
router.get(  "/parcelles",                      checkPermission("parcelles", "voir_carte"),        listParcelles);
router.post( "/parcelles",                      checkPermission("parcelles", "creer_parcelle"),    createParcelle);
router.put(  "/parcelles/:id",                  checkPermission("parcelles", "modifier_parcelle"), updateParcelle);

export default router;
