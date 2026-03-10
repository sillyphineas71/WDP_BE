import { sequelize, Class, Assessment, Course } from "../models/index.js";
import { AppError, NotFoundError, ValidationError } from "../errors/AppError.js";

// Nhét cấu hình quiz vào instructions
function buildInstructionsWithMeta(instructions, meta) {
    const text = (instructions ?? "").trim();
    const metaBlock =
        "\n\n---\n[quiz_settings]\n" + JSON.stringify(meta, null, 2);
    return text ? text + metaBlock : metaBlock.trim();
}

export const teacherService = {

    /**
     * GET classes that teacher manages
     */
    getClassesByTeacher: async (teacherId) => {

        const classes = await Class.findAll({
            where: { teacher_id: teacherId },
            include: [
                {
                    model: Course,
                    attributes: ["name"]
                }
            ],
            order: [["start_date", "DESC"]]
        });

        return classes.map(c => ({
            id: c.id,
            name: c.name,
            courseName: c.Course?.name,
            startDate: c.start_date,
            endDate: c.end_date,
            status: c.status
        }));
    },


    /**
     * UC_TEA_08: Create QUIZ assessment (draft)
     */
    createQuiz: async (teacherId, classId, payload) => {

        // 1️⃣ Check class exists
        const clazz = await Class.findByPk(classId);

        if (!clazz) {
            throw new NotFoundError("Class not found");
        }

        // 2️⃣ Check teacher ownership
        if (String(clazz.teacher_id) !== String(teacherId)) {
            throw new AppError(
                "Forbidden: not owner teacher of this class",
                403
            );
        }

        // 3️⃣ Attempt limit rule
        let attemptLimit = payload.attemptLimit ?? null;

        if (attemptLimit === 0) attemptLimit = null;

        if (attemptLimit !== null && attemptLimit < 1) {
            throw new ValidationError(
                "attemptLimit must be >= 1 (or 0 for unlimited)"
            );
        }

        const timeLimit = payload.timeLimitMinutes ?? null;
        const dueAt = payload.closeAt ?? null;

        // 4️⃣ Extra settings
        const settingsMeta = {
            openAt: payload.openAt ?? null,
            closeAt: payload.closeAt ?? null,
            gradeMethod: payload.gradeMethod ?? "highest",
            shuffleQuestions: !!payload.shuffleQuestions,
            reviewOption: payload.reviewOption ?? "after_submit"
        };

        const instructions = buildInstructionsWithMeta(
            payload.instructions,
            settingsMeta
        );

        // 5️⃣ Create quiz
        const quiz = await sequelize.transaction(async (t) => {

            return Assessment.create(
                {
                    class_id: classId,
                    created_by: teacherId,
                    type: "QUIZ",
                    title: payload.title,
                    instructions,
                    due_at: dueAt,
                    time_limit_minutes: timeLimit,
                    attempt_limit: attemptLimit,
                    status: "draft"
                },
                { transaction: t }
            );

        });

        return {
            id: quiz.id,
            type: quiz.type,
            status: quiz.status,
            classId,
            next: `/teacher/classes/${classId}/quizzes/${quiz.id}/questions`
        };

    },

    /**
     * UC_TEA_10: Create ESSAY assessment (Assignment)
     */
    createAssignment: async (teacherId, classId, payload) => {
        // 1️⃣ Check class exists
        const clazz = await Class.findByPk(classId);

        if (!clazz) {
            throw new NotFoundError("Class not found");
        }

        // 2️⃣ Check teacher ownership
        if (String(clazz.teacher_id) !== String(teacherId)) {
            throw new AppError(
                "Forbidden: not owner teacher of this class",
                403
            );
        }

        const dueAt = payload.closeAt ?? null;
        
        // 3️⃣ Extra settings for Assignment
        const settingsMeta = {
            openAt: payload.openAt ?? null,
            closeAt: payload.closeAt ?? null,
            cutOffAt: payload.cutOffAt ?? null, 
            submissionTypes: payload.submissionTypes,
            maxFiles: payload.maxFiles,
            maxFileSizeMB: payload.maxFileSizeMB,
            allowedFileTypes: payload.allowedFileTypes,
            maxScore: payload.maxScore
        };

        const instructions = buildInstructionsWithMeta(
            payload.instructions,
            settingsMeta
        );

        // 4️⃣ Create assignment
        const assignment = await sequelize.transaction(async (t) => {
            return Assessment.create(
                {
                    class_id: classId,
                    created_by: teacherId,
                    type: "ESSAY",
                    title: payload.title,
                    instructions,
                    due_at: dueAt,
                    status: payload.status || "published" // A1: Save as draft supported via status
                },
                { transaction: t }
            );
        });

        return {
            id: assignment.id,
            type: assignment.type,
            status: assignment.status,
            classId,
            next: `/teacher/classes/${classId}/assignments/${assignment.id}`
        };
    },

    /**
     * UC_TEA_15: Publish or Unpublish Grades for an Assessment
     */
    publishAssessmentGrades: async (teacherId, classId, assessmentId, isPublished) => {
        // 1️⃣ Check class exists and teacher ownership
        const clazz = await Class.findByPk(classId);

        if (!clazz) {
            throw new NotFoundError("Class not found");
        }

        if (String(clazz.teacher_id) !== String(teacherId)) {
            throw new AppError(
                "Forbidden: not owner teacher of this class",
                403
            );
        }

        // 2️⃣ Check assessment belongs to class
        const assessment = await Assessment.findOne({
            where: { id: assessmentId, class_id: classId }
        });

        if (!assessment) {
            throw new NotFoundError("Assessment not found in this class");
        }

        // 3️⃣ Update grades (Assuming Grade model is imported, need to import it at the top or use sequelize)
        // We need to update grades associated with submissions of this assessment
        const { Grade, Submission } = require("../models/index.js");

        const updateData = {
            is_published: isPublished,
            published_at: isPublished ? new Date() : null
        };

        // Find all submissions for this assessment
        const submissions = await Submission.findAll({
            where: { assessment_id: assessmentId },
            attributes: ["id"]
        });

        const submissionIds = submissions.map(s => s.id);

        if (submissionIds.length === 0) {
            throw new AppError("No submissions found for this assessment to publish grades for", 400);
        }

        // Update grades
        const [updatedRowCount] = await Grade.update(updateData, {
            where: { submission_id: submissionIds }
        });

        return {
            message: `Successfully ${isPublished ? 'published' : 'unpublished'} grades.`,
            updatedCount: updatedRowCount
        };
    }

};