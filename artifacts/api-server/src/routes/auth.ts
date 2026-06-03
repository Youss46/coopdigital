import { Router, type IRouter } from "express";
import { login } from "../controllers/authController";

const router: IRouter = Router();

router.post("/auth/login", login);

export default router;
