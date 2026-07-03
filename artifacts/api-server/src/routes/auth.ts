import { Router, type IRouter } from "express";
import { login, changerMotDePasse, savePhoto } from "../controllers/authController";
import { authMiddleware } from "../middlewares/auth.js";
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listCredentials,
  deleteCredential,
} from "../controllers/webauthnController";

const router: IRouter = Router();

router.post("/auth/login", login);
router.put("/auth/changer-mot-de-passe", authMiddleware, changerMotDePasse);
router.put("/auth/photo", authMiddleware, savePhoto);

router.post("/auth/webauthn/register/options", authMiddleware, getRegistrationOptions);
router.post("/auth/webauthn/register/verify", authMiddleware, verifyRegistration);
router.post("/auth/webauthn/login/options", getAuthenticationOptions);
router.post("/auth/webauthn/login/verify", verifyAuthentication);
router.get("/auth/webauthn/credentials", authMiddleware, listCredentials);
router.delete("/auth/webauthn/credentials/:id", authMiddleware, deleteCredential);

export default router;
