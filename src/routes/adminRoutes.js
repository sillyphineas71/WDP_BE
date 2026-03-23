import express from "express";
import { adminController } from "../controllers/adminController.js";
import { userManagementController } from "../controllers/userManagementController.js";

const router = express.Router();

// UC_ADM_10: Courses
router.get("/courses", adminController.getCourses);
router.post("/courses", adminController.addCourse);
router.put("/courses/:id", adminController.editCourse);
router.delete("/courses/:id", adminController.removeCourse);
router.post("/courses/import/validate", adminController.validateCourseImport);
router.post("/courses/import/confirm", adminController.confirmCourseImport);

// UC_ADM_11: Classes
router.get("/classes", adminController.getClasses);
router.post("/classes", adminController.addClass);

router.get("/classes/create", adminController.getCreatePage); 

router.get("/classes/:id", adminController.getClassById); 
router.put("/classes/:id", adminController.editClass);
router.put("/classes/:id/assign-teacher", adminController.assignTeacher);
router.post("/classes/:id/sessions", adminController.addSession);
router.put("/classes/:id/sessions", adminController.editSessions);
router.put("/classes/:id/sessions/:sessionId", adminController.updateSession);
router.delete("/classes/:id/sessions", adminController.deleteSessions);
router.post("/classes/import/validate", adminController.validateClassImport);
router.post("/classes/import/confirm", adminController.confirmClassImport);

// UC_ADM_15: Import Lịch học
router.post("/schedule/import/validate", adminController.validateScheduleImport);
router.post("/schedule/import/confirm", adminController.confirmScheduleImport);

// UC_ADM_12: Teachers
router.get("/teachers", adminController.getTeachers);

// UC_ADM_13: Students
router.get("/students", adminController.getStudents);
router.post("/classes/:id/enroll", adminController.enrollStudents);
router.post("/classes/:id/import-students", adminController.importStudents);
router.post("/classes/:id/import-students/validate", adminController.validateStudentImport);
router.post("/classes/:id/import-students/confirm", adminController.confirmStudentImport);
router.delete("/classes/:id/students/:studentId", adminController.unenrollStudent);

// UC_ADM_17 & UC_ADM_18: Dashboard & Reports
router.get("/dashboard/stats", adminController.getDashboardStats);
router.get("/reports/data", adminController.getReportData);
router.get("/reports/filters", adminController.getReportFilters);
router.get("/reports/teacher-activity", adminController.getTeacherActivity);

// UC_ADM_05 → UC_ADM_09: User Management
router.get("/users", userManagementController.getUsers);
router.post("/users", userManagementController.createUser);
router.post("/users/import/validate", userManagementController.validateImport);
router.post("/users/import/confirm", userManagementController.confirmImport);
router.put("/users/:id", userManagementController.updateUser);
router.patch("/users/:id/status", userManagementController.toggleStatus);
router.patch("/users/:id/reset-password", userManagementController.resetPassword);
router.post("/debug/seed", adminController.seedDebugData);

export default router;