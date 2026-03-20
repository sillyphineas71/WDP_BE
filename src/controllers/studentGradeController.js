// src/controllers/studentGradeController.js
// UC_STU_12: Student view grades & feedback
import { studentGradeService } from "../services/studentGradeService.js";

export const studentGradeController = {

    getGradesOverview: async (req, res, next) => {
        try {
            const studentId = req.user.id;
            const data = await studentGradeService.getGradesOverview(studentId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    getClassGrades: async (req, res, next) => {
        try {
            const studentId = req.user.id;
            const { classId } = req.params;
            const data = await studentGradeService.getClassGrades(studentId, classId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },
};
