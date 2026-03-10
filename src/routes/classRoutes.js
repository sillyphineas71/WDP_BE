import express from "express";
import * as controller from "../controllers/classSessionController.js";
import { getClassesWithCourse } from "../controllers/classQueryController.js";
const router = express.Router();

router.get("/", getClassesWithCourse);
router.post("/:classId/sessions/manual", controller.createManualClassSession);

export default router;
