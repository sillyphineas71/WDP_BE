// src/controllers/teacherController.js
import { teacherService } from "../services/teacherService.js";
import { validateCreateQuiz, validateCreateAssignment, validatePublishGrades } from "../validators/teacherValidator.js";
import { createEssaySchema } from "../validators/assessmentValidator.js";
import { successResponse } from "../utils/responseUtils.js";

// --- Dev branch: Quiz & Assignment & Grades (nam-branch) ---

export const getMyClasses = async (req, res, next) => {
    try {
        const teacherId = req.user?.id;

        if (!teacherId) {
            return res.status(401).json({
                message: "Unauthorized"
            });
        }

        const classes = await teacherService.getClassesByTeacher(teacherId);

        return res.json(
            successResponse(classes, "Teacher classes fetched successfully")
        );

    } catch (err) {
        next(err);
    }
};

export const createQuiz = async (req, res, next) => {
    try {
        const teacherId = req.user?.id;
        const { classId } = req.params;

        // Validate (Joi)
        const { error, value } = validateCreateQuiz(req.body);
        if (error) return next(error);

        const data = await teacherService.createQuiz(
            teacherId,
            classId,
            value
        );

        return res
            .status(201)
            .json(successResponse(data, "Quiz created", 201));

    } catch (err) {
        next(err);
    }
};

export const createAssignment = async (req, res, next) => {
    try {
        const teacherId = req.user?.id;
        const { classId } = req.params;

        // Validate (Joi)
        const { error, value } = validateCreateAssignment(req.body);
        if (error) return next(error);

        const data = await teacherService.createAssignment(
            teacherId,
            classId,
            value
        );

        return res
            .status(201)
            .json(successResponse(data, "Assignment created successfully", 201));

    } catch (err) {
        next(err);
    }
};

export const publishGrades = async (req, res, next) => {
    try {
        const teacherId = req.user?.id;
        const { classId, assessmentId } = req.params;

        // Validate
        const { error, value } = validatePublishGrades(req.body);
        if (error) return next(error);

        const data = await teacherService.publishAssessmentGrades(
            teacherId,
            classId,
            assessmentId,
            value.is_published
        );

        return res
            .status(200)
            .json(successResponse(data, data.message, 200));

    } catch (err) {
        next(err);
    }
};

// --- Minh-branch: Essay Assessment CRUD & Grading ---

export const createEssayAssessment = async (req, res, next) => {
    try {
        // Validate dữ liệu đầu vào (Bắt Exception E1)
        const { error, value } = createEssaySchema.validate(req.body, { abortEarly: false });

        if (error) {
            const validationErrors = error.details.map((detail) => ({
                field: detail.path.join("."),
                message: detail.message,
            }));
            return res.status(400).json({
                success: false,
                message: "Dữ liệu không hợp lệ",
                statusCode: 400,
                errors: validationErrors,
            });
        }

        const teacherId = req.user.id;
        const classId = req.params.classId;

        // Gọi Service
        const data = await teacherService.createEssayAssessment(teacherId, classId, value);

        // Postconditions: Trả về thành công
        res.status(201).json({
            success: true,
            message: value.status === 'draft' ? "Đã lưu nháp bài tập." : "Tạo bài tập tự luận thành công.",
            data,
        });
    } catch (err) {
        next(err);
    }
};

export const getAssignmentsByClass = async (req, res, next) => {
    try {
        const teacherId = req.user.id;
        const classId = req.params.classId;

        const data = await teacherService.getAssignmentsByClass(teacherId, classId);

        res.status(200).json({
            success: true,
            data: data,
        });
    } catch (error) {
        next(error);
    }
};

export const updateEssayAssessment = async (req, res, next) => {
    try {
        const teacherId = req.user.id;
        const { classId, assessmentId } = req.params;
        const data = req.body;

        // Gọi xuống service để thực hiện logic update
        const updatedAssessment = await teacherService.updateEssayAssessment(
            teacherId,
            classId,
            assessmentId,
            data
        );

        res.status(200).json({
            success: true,
            message: "Cập nhật bài tập thành công",
            data: updatedAssessment,
        });
    } catch (error) {
        next(error);
    }
};

export const deleteAssessment = async (req, res, next) => {
    try {
        const { assessmentId } = req.params;
        await teacherService.deleteAssessment(req.user.id, assessmentId);
        res.status(200).json({ success: true, message: "Xóa bài tập thành công" });
    } catch (error) { next(error); }
};

export const getSubmissionsByAssessment = async (req, res, next) => {
    try {
        const teacherId = req.user.id;
        const assessmentId = req.params.assessmentId;

        const data = await teacherService.getSubmissionsByAssessment(teacherId, assessmentId);

        res.status(200).json({
            success: true,
            message: "Lấy danh sách bài nộp thành công",
            data: data
        });
    } catch (error) {
        next(error);
    }
};

export const getSubmissionForGrading = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const submission = await teacherService.getSubmissionForGrading(submissionId);

        res.status(200).json({
            success: true,
            data: submission
        });
    } catch (error) {
        console.error("Lỗi getSubmissionForGrading:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const gradeSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;
        const teacherId = req.user.id;
        const gradeData = req.body;

        const grade = await teacherService.gradeSubmission(teacherId, submissionId, gradeData);

        res.status(200).json({
            success: true,
            message: "Đã lưu điểm thành công",
            data: grade
        });
    } catch (error) {
        console.error("Lỗi gradeSubmission:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const aiGradeSubmission = async (req, res) => {
    try {
        const { submissionId } = req.params;

        const aiResult = await teacherService.aiGradeSubmission(submissionId);

        res.status(200).json({
            success: true,
            message: "AI đã phân tích xong",
            data: aiResult
        });
    } catch (error) {
        console.error("Lỗi aiGradeSubmission:", error);
        res.status(500).json({
            success: false,
            message: "Lỗi khi gọi AI: " + (error.message || "Không xác định")
        });
    }
};