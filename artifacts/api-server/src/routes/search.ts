import { Router, type IRouter } from "express";
import { globalSearch } from "../controllers/searchController";

const router: IRouter = Router();

router.get("/search", globalSearch);

export default router;
