import express from "express";
import * as controller from "../controllers/classSessionController.js";

const router = express.Router();

router.put("/:sessionId/manual", controller.updateManualClassSession);
router.patch("/:sessionId/cancel", controller.cancelManualClassSession);
router.get("/", controller.getClassSessions);
export default router;
