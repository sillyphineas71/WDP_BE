import express from "express";
import * as controller from "../controllers/coursePublicMaterialController.js";
import { USER_ROLES } from "../constants/roles.js";
import { authorize, isAuth } from "../middleware/isAuth.js";

const router = express.Router();

router.get(
  "/search",
  isAuth,
  authorize(USER_ROLES.ADMIN, USER_ROLES.TEACHER, USER_ROLES.STUDENT),
  controller.searchPublicMaterialsByCourseCode,
);

export default router;
