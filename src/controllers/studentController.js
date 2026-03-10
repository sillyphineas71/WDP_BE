import { studentService } from "../services/studentService.js";
import { validateSaveAnswer } from "../validators/studentValidator.js";
import { successResponse } from "../utils/responseUtils.js";

export const studentController = {
    // HEAD functionalities
    getDashboard: async (req, res, next) => {
        try {
            const { studentId } = req.query;
            if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
            const data = await studentService.getDashboard(studentId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    getMyClasses: async (req, res, next) => {
        try {
            const { studentId } = req.query;
            if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
            const data = await studentService.getMyClasses(studentId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    getClassDetails: async (req, res, next) => {
        try {
            const { studentId } = req.query;
            if (!studentId) return res.status(400).json({ success: false, message: "studentId is required" });
            const classId = req.params.id;
            const data = await studentService.getClassDetails(studentId, classId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            next(error);
        }
    },

    // nam-branch functionalities
    // POST /api/student/quizzes/:quizId/attempts/start
    startAttempt: async (req, res, next) => {
        try {
            const studentId = req.user?.id;
            const { quizId } = req.params;

            const data = await studentService.startOrResumeAttempt({ studentId, quizId });
            return res.status(200).json(successResponse(data, "OK", 200));
        } catch (e) {
            next(e);
        }
    },

    // GET /api/student/attempts/:submissionId
    getAttempt: async (req, res, next) => {
        try {
            const studentId = req.user?.id;
            const { submissionId } = req.params;

            const data = await studentService.getAttemptState({ studentId, submissionId });
            return res.status(200).json(successResponse(data, "OK", 200));
        } catch (e) {
            next(e);
        }
    },

    // PUT /api/student/attempts/:submissionId/questions/:questionId/answer
    saveAnswer: async (req, res, next) => {
        try {
            const { error, value } = validateSaveAnswer(req.body);
            if (error) return next(error);

            const studentId = req.user?.id;
            const { submissionId, questionId } = req.params;

            const data = await studentService.saveAnswer({
                studentId,
                submissionId,
                questionId,
                payload: value,
            });

            return res.status(200).json(successResponse(data, "Saved", 200));
        } catch (e) {
            next(e);
        }
    },

    // GET /api/student/attempts/:submissionId/summary
    getSummary: async (req, res, next) => {
        try {
            const studentId = req.user?.id;
            const { submissionId } = req.params;

            const data = await studentService.getAttemptSummary({ studentId, submissionId });
            return res.status(200).json(successResponse(data, "OK", 200));
        } catch (e) {
            next(e);
        }
    },

    // POST /api/student/attempts/:submissionId/submit
    submitAttempt: async (req, res, next) => {
        try {
            const studentId = req.user?.id;
            const { submissionId } = req.params;

            const data = await studentService.submitAttempt({ studentId, submissionId });
            return res.status(200).json(successResponse(data, "Submitted", 200));
        } catch (e) {
            next(e);
        }
    },
};
