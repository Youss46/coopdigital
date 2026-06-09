import { Router } from "express";
import { authMiddleware } from "../middlewares/auth";
import {
  handleGetConfig,
  handleUpdateConfig,
  handleUploadLogo,
  handleGetDocuments,
  handleCreateDocument,
  handleDeleteDocument,
  handleExportConfigPdf,
} from "../controllers/configController";

const router = Router();

router.get("/config",                  authMiddleware, handleGetConfig);
router.put("/config",                  authMiddleware, handleUpdateConfig);
router.post("/config/logo",            authMiddleware, handleUploadLogo);
router.get("/config/export-pdf",       authMiddleware, handleExportConfigPdf);
router.get("/config/documents",        authMiddleware, handleGetDocuments);
router.post("/config/documents",       authMiddleware, handleCreateDocument);
router.delete("/config/documents/:id", authMiddleware, handleDeleteDocument);

export default router;
