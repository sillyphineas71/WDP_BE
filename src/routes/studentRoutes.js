
import express from "express";
import {
  getDashboard,
  getMyClasses,
  getClassDetails,
} from "../controllers/studentController.js";
import { isAuth, authorize } from "../middleware/isAuth.js";
import * as materialCtrl from "../controllers/studentMaterialController.js";
const router = express.Router();

// Student Dashboard View (UC_STU_06)
router.get("/dashboard", getDashboard);

// My Classes View
router.get("/classes", getMyClasses);

// Class Detail View (UC_STU_07)
router.get("/classes/:id", getClassDetails);

// Tất cả route yêu cầu đăng nhập + role STUDENT
// router.use(isAuth, authorize("STUDENT"));

// ────────────── UC_STU_08: Xem/Tải tài liệu ──────────────

// Danh sách tài liệu của lớp (chỉ visible)
router.get("/classes/:classId/materials", materialCtrl.getClassMaterials);

// Chi tiết tài liệu
router.get("/materials/:materialId", materialCtrl.getMaterialDetail);

// Download / redirect URL
router.get("/materials/:materialId/download", materialCtrl.downloadMaterial);


export default router;
