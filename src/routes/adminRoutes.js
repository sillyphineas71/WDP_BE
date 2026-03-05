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

router.get("/classes/create", adminController.getCreatePage); 

router.get("/classes/:id", adminController.getClassById); 
router.put("/classes/:id", adminController.editClass);
router.put("/classes/:id/assign-teacher", adminController.assignTeacher);
router.post("/classes/:id/sessions", adminController.addSession);
router.put("/classes/:id/sessions", adminController.editSessions);
router.delete("/classes/:id/sessions", adminController.deleteSessions);

// UC_ADM_12: Teachers
router.get("/teachers", adminController.getTeachers);

// UC_ADM_13: Students
router.get("/students", adminController.getStudents);
router.post("/classes/:id/enroll", adminController.enrollStudents);
router.post("/classes/:id/import-students", adminController.importStudents);
router.delete("/classes/:id/students/:studentId", adminController.unenrollStudent);

// UC_ADM_17 & UC_ADM_18: Dashboard & Reports
router.get("/dashboard/stats", adminController.getDashboardStats);
router.get("/reports/data", adminController.getReportData);
router.get("/reports/filters", adminController.getReportFilters);
router.get("/reports/teacher-activity", adminController.getTeacherActivity);

export default router;