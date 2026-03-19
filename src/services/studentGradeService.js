// src/services/studentGradeService.js
// UC_STU_12: Student view grades & feedback (from GV and AI)
import { Enrollment } from "../models/Enrollment.js";
import { Class } from "../models/Class.js";
import { Course } from "../models/Course.js";
import { Assessment } from "../models/Assessment.js";
import { Submission } from "../models/Submission.js";
import { Grade } from "../models/Grade.js";
import { User } from "../models/User.js";
import { Sequelize } from "sequelize";
import { NotFoundError } from "../errors/AppError.js";

export const studentGradeService = {

    // ── Tổng quan điểm tất cả lớp ──
    getGradesOverview: async (studentId) => {
        // Get all enrolled classes for this student
        const enrollments = await Enrollment.findAll({
            where: { user_id: studentId },
            include: [
                {
                    model: Class,
                    as: "class",
                    include: [
                        { model: Course, as: "course", attributes: ["name", "code"] },
                        { model: User, as: "teacher", attributes: ["full_name"] },
                    ],
                },
            ],
        });

        const result = [];

        for (const enrollment of enrollments) {
            const cls = enrollment.class;
            if (!cls) continue;

            // Get all assessments for this class
            const assessments = await Assessment.findAll({
                where: { class_id: cls.id },
            });

            // Get student's submissions + grades for published grades
            let totalWeight = 0;
            let weightedScore = 0;
            let publishedCount = 0;

            for (const assessment of assessments) {
                const submission = await Submission.findOne({
                    where: { assessment_id: assessment.id, student_id: studentId },
                    include: [{ model: Grade, as: "grade" }],
                });

                if (submission?.grade?.is_published) {
                    publishedCount++;
                    const weight = assessment.weight || 0;
                    totalWeight += weight;
                    if (submission.grade.final_score !== null && submission.grade.final_score !== undefined) {
                        weightedScore += parseFloat(submission.grade.final_score) * (weight / 100);
                    }
                }
            }

            result.push({
                class_id: cls.id,
                class_name: cls.name,
                course_name: cls.course?.name || "",
                teacher: cls.teacher?.full_name || "N/A",
                total_assessments: assessments.length,
                published_count: publishedCount,
                course_total: totalWeight > 0 ? (weightedScore / (totalWeight / 100)).toFixed(2) : null,
            });
        }

        return result;
    },

    // ── Chi tiết điểm cho 1 lớp + feedback ──
    getClassGrades: async (studentId, classId) => {
        // Verify enrollment
        const enrollment = await Enrollment.findOne({
            where: { user_id: studentId, class_id: classId },
        });
        if (!enrollment) throw new NotFoundError("Bạn không tham gia lớp học này.");

        const cls = await Class.findByPk(classId, {
            include: [
                { model: Course, as: "course", attributes: ["name", "code"] },
                { model: User, as: "teacher", attributes: ["full_name"] },
            ],
        });
        if (!cls) throw new NotFoundError("Lớp học không tồn tại.");

        const assessments = await Assessment.findAll({
            where: { class_id: classId },
            order: [["created_at", "ASC"]],
        });

        const gradeItems = [];
        let totalWeight = 0;

        for (const assessment of assessments) {
            const submission = await Submission.findOne({
                where: { assessment_id: assessment.id, student_id: studentId },
                include: [{ model: Grade, as: "grade" }],
            });

            let status = "no_submission";
            let score = null;
            let feedback = null;
            let aiFeedback = null;
            let submittedAt = null;

            if (submission) {
                submittedAt = submission.submitted_at;

                if (submission.grade) {
                    if (submission.grade.is_published) {
                        status = "published";
                        score = submission.grade.final_score !== null ? parseFloat(submission.grade.final_score) : null;
                        feedback = submission.grade.final_feedback || null;
                        aiFeedback = submission.grade.ai_feedback_json || null;
                        totalWeight += (assessment.weight || 0);
                    } else {
                        status = "hidden";
                    }
                } else {
                    status = "submitted";
                }
            }

            gradeItems.push({
                assessment_id: assessment.id,
                title: assessment.title,
                type: assessment.type || "ESSAY",
                weight: assessment.weight || 0,
                max_score: assessment.max_score || 10,
                score,
                status,
                feedback,
                ai_feedback: aiFeedback,
                submitted_at: submittedAt,
            });
        }

        // Calculate course total
        let courseTotal = null;
        const publishedItems = gradeItems.filter(g => g.status === "published" && g.score !== null);
        if (publishedItems.length > 0) {
            const weightedSum = publishedItems.reduce((sum, g) => sum + g.score * (g.weight / 100), 0);
            const totalW = publishedItems.reduce((sum, g) => sum + g.weight, 0);
            courseTotal = totalW > 0 ? (weightedSum / (totalW / 100)).toFixed(2) : null;
        }

        return {
            class: {
                id: cls.id,
                name: cls.name,
                course: cls.course?.name || "",
                teacher: cls.teacher?.full_name || "N/A",
            },
            grade_items: gradeItems,
            course_total: courseTotal,
            total_weight: totalWeight,
        };
    },
};
