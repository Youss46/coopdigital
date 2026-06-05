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
} from "../controllers/usersController";

const router = Router();

router.get("/users", authMiddleware, listUsers);
router.post("/users", authMiddleware, auditMiddleware("users", "CREATE", { entiteType: "utilisateur" }), createUser);
router.put("/users/:id", authMiddleware, auditMiddleware("users", "UPDATE", { entiteIdParam: "id", entiteType: "utilisateur" }), updateUser);
router.put("/users/:id/password", authMiddleware, auditMiddleware("users", "CONFIG_CHANGE", { entiteIdParam: "id", entiteType: "utilisateur" }), resetUserPassword);
router.delete("/users/:id", authMiddleware, auditMiddleware("users", "DELETE", { entiteIdParam: "id", entiteType: "utilisateur" }), deleteUser);
router.put("/users/:id/activer", authMiddleware, auditMiddleware("users", "UPDATE", { entiteIdParam: "id", entiteType: "utilisateur" }), toggleUserActif);

export default router;
