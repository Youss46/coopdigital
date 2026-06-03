import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
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
router.post("/users", authMiddleware, createUser);
router.put("/users/:id", authMiddleware, updateUser);
router.put("/users/:id/password", authMiddleware, resetUserPassword);
router.delete("/users/:id", authMiddleware, deleteUser);
router.put("/users/:id/activer", authMiddleware, toggleUserActif);

export default router;
