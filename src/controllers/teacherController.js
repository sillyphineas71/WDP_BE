import { teacherService } from "../services/teacherService.js";
import { validateCreateQuiz, validateCreateAssignment } from "../validators/teacherValidator.js";
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
    }

};