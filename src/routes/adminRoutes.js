import express from "express";
import { adminController } from "../controllers/adminController.js";

const router = express.Router();

// UC_ADM_10: Courses
router.get("/courses", adminController.getCourses);
router.post("/courses", adminController.addCourse);
router.put("/courses/:id", adminController.editCourse);
router.delete("/courses/:id", adminController.removeCourse);

// UC_ADM_11: Classes
router.get("/classes", adminController.getClasses);
router.post("/classes", adminController.addClass);
router.get("/classes/:id", adminController.getClassById);
router.put("/classes/:id", adminController.editClass);

export default router;