import { teacherService } from "../services/teacherService.js";
import { validateCreateQuiz, validateCreateAssignment, validatePublishGrades } from "../validators/teacherValidator.js";
import { successResponse } from "../utils/responseUtils.js";

export const teacherController = {

    /**
     * GET /api/teacher/classes
     * Lấy các lớp giáo viên phụ trách
     */
    getMyClasses: async (req, res, next) => {
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
    },

    /**
     * POST /api/teacher/classes/:classId/quizzes
     */
    createQuiz: async (req, res, next) => {
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
    },

    /**
     * POST /api/teacher/classes/:classId/assignments
     * UC_TEA_10: Tạo Bài tập Tự luận (Assignment)
     */
    createAssignment: async (req, res, next) => {
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
    },

    /**
     * PUT /api/teacher/classes/:classId/assessments/:assessmentId/grades/publish
     * UC_TEA_15: Công bố điểm
     */
    publishGrades: async (req, res, next) => {
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
    }

};