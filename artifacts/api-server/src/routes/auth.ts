import { Router, type IRouter } from "express";
import { login, changerMotDePasse } from "../controllers/authController";
import { authMiddleware } from "../middlewares/auth.js";

const router: IRouter = Router();

router.post("/auth/login", login);
router.put("/auth/changer-mot-de-passe", authMiddleware, changerMotDePasse);

export default router;
