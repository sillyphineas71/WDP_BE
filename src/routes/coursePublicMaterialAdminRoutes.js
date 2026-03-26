import express from "express";
import * as controller from "../controllers/coursePublicMaterialController.js";
import { USER_ROLES } from "../constants/roles.js";
import { authorize, isAuth } from "../middleware/isAuth.js";
import { uploadSinglePublicMaterialFile } from "../middleware/publicMaterialUploadMiddleware.js";

const router = express.Router();

router.use(isAuth, authorize(USER_ROLES.ADMIN));

router.get("/courses/:courseId/public-materials", controller.getAdminCoursePublicMaterials);
router.post(
  "/courses/:courseId/public-materials",
  uploadSinglePublicMaterialFile,
  controller.createCoursePublicMaterial,
);
router.put("/public-materials/:materialId", controller.updateCoursePublicMaterial);
router.patch(
  "/public-materials/:materialId/visibility",
  controller.toggleCoursePublicMaterialVisibility,
);
router.delete("/public-materials/:materialId", controller.deleteCoursePublicMaterial);

export default router;
