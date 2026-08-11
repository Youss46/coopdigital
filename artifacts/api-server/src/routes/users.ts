import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import { auditMiddleware } from "../middlewares/auditMiddleware";
import {
  listUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  toggleUserActif,
  getMesPeseurs,
  createPeseurParDelegue,
  togglePeseurActifParDelegue,
  listAllPeseurs,
  createPeseurAdmin,
  resetPeseurPassword,
} from "../controllers/usersController";

const router = Router();

router.get("/users", authMiddleware, listUsers);
// Gestion des peseurs (délégué : ses propres peseurs)
router.get("/users/mes-peseurs",                    authMiddleware, getMesPeseurs);
router.post("/users/peseurs",                       authMiddleware, createPeseurParDelegue);
// Routes admin peseurs — AVANT /:id pour éviter les conflits de route
router.get("/users/peseurs/admin",                  authMiddleware, listAllPeseurs);
router.post("/users/peseurs/admin",                 authMiddleware, createPeseurAdmin);
// Routes partagées délégué + admin (implémentation unifiée)
router.put("/users/peseurs/:id/activer",            authMiddleware, togglePeseurActifParDelegue);
router.put("/users/peseurs/:id/password",           authMiddleware, resetPeseurPassword);
router.post("/users", authMiddleware, auditMiddleware("users", "CREATE", { entiteType: "utilisateur" }), createUser);
router.put("/users/:id", authMiddleware, auditMiddleware("users", "UPDATE", { entiteIdParam: "id", entiteType: "utilisateur" }), updateUser);
router.put("/users/:id/password", authMiddleware, auditMiddleware("users", "CONFIG_CHANGE", { entiteIdParam: "id", entiteType: "utilisateur" }), resetUserPassword);
router.delete("/users/:id", authMiddleware, auditMiddleware("users", "DELETE", { entiteIdParam: "id", entiteType: "utilisateur" }), deleteUser);
router.put("/users/:id/activer", authMiddleware, auditMiddleware("users", "UPDATE", { entiteIdParam: "id", entiteType: "utilisateur" }), toggleUserActif);

export default router;
