import express from "express";
import * as controller from "../controllers/classSessionController.js";

const router = express.Router();

router.post("/:classId/sessions/manual", controller.createManualClassSession);

export default router;
