// src/controllers/studentController.js
import { studentService } from "../services/studentService.js";
import { validateSaveAnswer } from "../validators/studentValidator.js";
import { successResponse } from "../utils/responseUtils.js";

// --- Minh-branch: Dashboard / Classes (lấy studentId từ req.user.id) ---

export const getDashboard = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const data = await studentService.getDashboard(studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getMyClasses = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const data = await studentService.getMyClasses(studentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const getClassDetails = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const classId = req.params.id;
        const data = await studentService.getClassDetails(studentId, classId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

// --- Minh-branch: Assignment detail & submit ---

export const getAssignmentDetail = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const data = await studentService.getAssignmentDetail(studentId, req.params.assessmentId);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export const submitAssignment = async (req, res, next) => {
    try {
        const studentId = req.user.id;
        const data = await studentService.submitAssignment(studentId, req.params.assessmentId, req.body);
        res.status(200).json({ success: true, message: "Thao tác nộp bài thành công", data });
    } catch (error) {
        next(error);
    }
};

// --- Dev (nam-branch) functionalities: Quiz Attempts ---

export const startAttempt = async (req, res, next) => {
    try {
        const studentId = req.user?.id;
        const { quizId } = req.params;

        const data = await studentService.startOrResumeAttempt({ studentId, quizId });
        return res.status(200).json(successResponse(data, "OK", 200));
    } catch (e) {
        next(e);
    }
};

export const getAttempt = async (req, res, next) => {
    try {
        const studentId = req.user?.id;
        const { submissionId } = req.params;

        const data = await studentService.getAttemptState({ studentId, submissionId });
        return res.status(200).json(successResponse(data, "OK", 200));
    } catch (e) {
        next(e);
    }
};

export const saveAnswer = async (req, res, next) => {
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
};

export const getSummary = async (req, res, next) => {
    try {
        const studentId = req.user?.id;
        const { submissionId } = req.params;

        const data = await studentService.getAttemptSummary({ studentId, submissionId });
        return res.status(200).json(successResponse(data, "OK", 200));
    } catch (e) {
        next(e);
    }
};

export const submitAttempt = async (req, res, next) => {
    try {
        const studentId = req.user?.id;
        const { submissionId } = req.params;

        const data = await studentService.submitAttempt({ studentId, submissionId });
        return res.status(200).json(successResponse(data, "Submitted", 200));
    } catch (e) {
        next(e);
    }
};