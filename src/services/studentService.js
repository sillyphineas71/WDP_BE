// src/services/studentService.js
import { Class } from "../models/Class.js";
import { Enrollment } from "../models/Enrollment.js";
import { User } from "../models/User.js";
import { ClassSession } from "../models/ClassSession.js";
import { Assessment } from "../models/Assessment.js";
import { Material } from "../models/Material.js";
import { Notification } from "../models/Notification.js";
import { AssessmentFile } from "../models/AssessmentFile.js";
import { SubmissionFile } from "../models/SubmissionFile.js";
import {
    sequelize,
    Submission,
    SubmissionAnswer,
    QuizQuestion,
    QuizOption,
    Grade,
} from "../models/index.js";
import { Op } from "sequelize";
import { AppError, ConflictError, NotFoundError } from "../errors/AppError.js";

/**
 * Parse quiz settings - reads from settings_json (JSONB) first,
 * falls back to parsing [quiz_settings] block in instructions text
 */
function parseQuizSettings(instructions, settingsJson) {
    // Prefer structured JSONB column
    if (settingsJson && typeof settingsJson === 'object' && Object.keys(settingsJson).length > 0) {
        return settingsJson;
    }
    // Fallback: parse from instructions text
    if (!instructions) return {};
    const marker = "[quiz_settings]";
    const idx = instructions.lastIndexOf(marker);
    if (idx === -1) return {};
    const jsonPart = instructions.slice(idx + marker.length).trim();
    try {
        return JSON.parse(jsonPart);
    } catch {
        return {};
    }
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function buildAttemptMeta({ questionOrder, optionOrder }) {
    return JSON.stringify(
        {
            questionOrder,
            optionOrder, // { [questionId]: [optionId...] }
        },
        null,
        2,
    );
}

function parseAttemptMeta(contentText) {
    if (!contentText) return null;
    try {
        return JSON.parse(contentText);
    } catch {
        return null;
    }
}

function computeExpiresAt(startedAt, timeLimitMinutes) {
    if (!timeLimitMinutes) return null;
    const ms = Number(timeLimitMinutes) * 60 * 1000;
    return new Date(new Date(startedAt).getTime() + ms);
}

function remainingSeconds(expiresAt) {
    if (!expiresAt) return null;
    const diff = expiresAt.getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
}

async function loadQuizWithQuestions(quizId) {
    const quiz = await Assessment.findByPk(quizId, {
        include: [
            {
                model: QuizQuestion,
                as: "questions",
                include: [{ model: QuizOption, as: "options" }],
            },
        ],
        order: [
            [{ model: QuizQuestion, as: "questions" }, "display_order", "ASC"],
            [
                { model: QuizQuestion, as: "questions" },
                { model: QuizOption, as: "options" },
                "display_order",
                "ASC",
            ],
        ],
    });

    if (!quiz) throw new NotFoundError("Quiz not found");
    if (quiz.type !== "QUIZ") throw new AppError("Assessment is not a QUIZ", 400);

    if (!quiz.questions || quiz.questions.length === 0) {
        throw new ConflictError("Quiz chưa có câu hỏi");
    }

    return quiz;
}

async function ensureStudentEnrolled(studentId, classId) {
    const enr = await Enrollment.findOne({
        where: { user_id: studentId, class_id: classId, status: "active" },
    });
    if (!enr) throw new AppError("Bạn chưa tham gia lớp học này", 403);
}

function ensureQuizAvailable(quiz, settings) {
    const now = new Date();

    if (quiz.status === "draft") throw new ConflictError("Quiz chưa được phát hành");
    if (quiz.status === "closed") throw new ConflictError("Quiz đã đóng");

    const openAt = settings.openAt ? new Date(settings.openAt) : null;
    const closeAt = settings.closeAt ? new Date(settings.closeAt) : (quiz.due_at ? new Date(quiz.due_at) : null);

    if (openAt && now < openAt) throw new ConflictError("Quiz chưa mở");
    if (closeAt && now > closeAt) throw new ConflictError("Quiz đã hết hạn");
}

async function autoGradeAndFinalize({ submission, quiz, settings, transaction }) {
    const answers = await SubmissionAnswer.findAll({
        where: { submission_id: submission.id },
        transaction,
    });

    const answerMap = new Map(answers.map((a) => [String(a.question_id), a]));
    let totalScore = 0;

    // max score
    const maxScore = quiz.questions.reduce((sum, q) => sum + Number(q.points || 0), 0);

    for (const q of quiz.questions) {
        const qid = String(q.id);
        const ans = answerMap.get(qid);

        const correctOptionIds = (q.options || [])
            .filter((o) => o.is_correct)
            .map((o) => String(o.id));

        let chosenIds = [];

        if (ans?.selected_option_id) {
            chosenIds = [String(ans.selected_option_id)];
        } else if (ans?.answer_text) {
            try {
                const parsed = JSON.parse(ans.answer_text);
                if (Array.isArray(parsed?.selectedOptionIds)) {
                    chosenIds = parsed.selectedOptionIds.map(String);
                }
            } catch {
                chosenIds = [];
            }
        }

        let isCorrect = null;
        let score = 0;

        if (correctOptionIds.length > 0) {
            const aSet = new Set(chosenIds);
            const cSet = new Set(correctOptionIds);

            const sameSize = aSet.size === cSet.size;
            const allMatch = sameSize && [...aSet].every((x) => cSet.has(x));

            isCorrect = allMatch;
            score = allMatch ? Number(q.points || 0) : 0;
        } else {
            isCorrect = null;
            score = 0;
        }

        totalScore += score;

        if (ans) {
            await ans.update(
                { is_correct: isCorrect, score },
                { transaction },
            );
        }
    }

    // Update submission
    await submission.update(
        { status: "graded", submitted_at: new Date() },
        { transaction },
    );

    // Publish policy
    const reviewOption = settings.reviewOption || "after_submit";
    const isPublished = reviewOption === "after_submit";

    // Upsert grade
    const [grade, created] = await Grade.findOrCreate({
        where: { submission_id: submission.id },
        defaults: {
            submission_id: submission.id,
            final_score: totalScore,
            graded_at: new Date(),
            status: "finalized",
            is_published: isPublished,
            published_at: isPublished ? new Date() : null,
        },
        transaction,
    });

    if (!created) {
        await grade.update(
            {
                final_score: totalScore,
                graded_at: new Date(),
                status: "finalized",
                is_published: isPublished,
                published_at: isPublished ? new Date() : null,
            },
            { transaction },
        );
    }

    const timeTakenSeconds = submission.started_at 
        ? Math.floor((new Date().getTime() - new Date(submission.started_at).getTime()) / 1000)
        : null;

    return {
        submissionId: submission.id,
        status: submission.status,
        totalScore,
        maxScore,
        isPublished,
        timeTakenSeconds,
        message: isPublished
            ? "Đã nộp bài và có điểm"
            : "Đã nộp bài. Điểm sẽ hiển thị sau khi đóng đề",
    };
}

// ================================================================
// MAIN SERVICE EXPORT
// ================================================================

export const studentService = {

    // ---------------------------------------------------------------
    // Dashboard (minh-branch style - uses model alias "class"/"teacher")
    // ---------------------------------------------------------------
    getDashboard: async (studentId) => {
        // 1. Get enrolled classes
        const enrollments = await Enrollment.findAll({
            where: { user_id: studentId },
            include: [
                {
                    model: Class,
                    as: "class",
                    include: [
                        {
                            model: User,
                            as: "teacher",
                            attributes: ["id", "full_name"],
                        },
                        {
                            model: ClassSession,
                            as: "sessions",
                            attributes: ["room"],
                            limit: 1, 
                        }
                    ],
                },
            ],
        });

        const enrolledClassIds = enrollments.map((e) => e.class_id);

        if (enrolledClassIds.length === 0) {
            return {
                classes: [],
                upcomingAssessmentsCount: 0,
                upcomingAssessments: [],
                todaySessions: [],
                recentActivities: []
            };
        }

        // 2. Count AND Get upcoming assessments in 7 days
        const next7Days = new Date();
        next7Days.setDate(next7Days.getDate() + 7);

        // Find assessments that the student has already submitted/graded
        const completedSubmissions = await Submission.findAll({
            where: {
                student_id: studentId,
                status: { [Op.ne]: 'in_progress' }
            },
            attributes: ['assessment_id'],
            raw: true
        });
        const completedAssessmentIds = completedSubmissions.map(s => s.assessment_id);

        const whereClause = {
            class_id: { [Op.in]: enrolledClassIds },
            status: "published",
            due_at: { [Op.between]: [new Date(), next7Days] },
        };

        if (completedAssessmentIds.length > 0) {
            whereClause.id = { [Op.notIn]: completedAssessmentIds };
        }

        const upcomingAssessmentsList = await Assessment.findAll({
            where: whereClause,
            include: [{ model: Class, as: "class", attributes: ["name"] }],
            order: [["due_at", "ASC"]],
        });

        const formattedAssessments = upcomingAssessmentsList.map(a => ({
            id: a.id,
            title: a.title,
            type: a.type,
            className: a.class?.name || "N/A",
            dueAt: a.due_at,
            dueFormatted: a.due_at ? new Date(a.due_at).toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'No due date',
            isUrgent: a.due_at ? (new Date(a.due_at) - new Date() < 24 * 60 * 60 * 1000) : false
        }));

        // 3. Get today's schedule
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const todaySessions = await ClassSession.findAll({
            where: {
                class_id: { [Op.in]: enrolledClassIds },
                start_time: { [Op.between]: [startOfDay, endOfDay] },
            },
            include: [{ model: Class, as: "class", attributes: ["id", "name"] }],
            order: [["start_time", "ASC"]],
        });

        const formattedSessions = todaySessions.map(session => ({
            id: session.id,
            title: session.class.name,
            date: session.start_time.toLocaleDateString('vi-VN'),
            time: `${session.start_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${session.end_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
            location: `Phòng ${session.room || 'TBA'}`
        }));

        // 4. Get Course Progress for list
        const formattedClasses = await Promise.all(enrollments.map(async e => {
            const classId = e.class.id;
            const totalSesh = await ClassSession.count({ where: { class_id: classId } });
            const completedSesh = await ClassSession.count({ where: { class_id: classId, start_time: { [Op.lt]: new Date() } } });
            const progressPercent = totalSesh === 0 ? 0 : Math.round((completedSesh / totalSesh) * 100);

            return {
                id: classId,
                name: e.class.name,
                teacher: e.class.teacher ? e.class.teacher.full_name : "N/A",
                room: e.class.sessions?.[0]?.room || "TBA",
                progress: progressPercent
            };
        }));

        // 5. Get Recent Activities (Grades & Materials)
        const recentGrades = await Grade.findAll({
            include: [
                {
                    model: Submission,
                    as: "submission",
                    where: { student_id: studentId },
                    include: [{ model: Assessment, as: "assessment", attributes: ["id", "title"] }]
                }
            ],
            where: { is_published: true },
            order: [["graded_at", "DESC"]],
            limit: 3
        });
        
        const formattedGrades = recentGrades.map(g => ({
            id: g.id,
            type: "grade",
            title: `Đã công bố điểm cho ${g.submission?.assessment?.title || 'Bài tập'}`,
            detail: `Điểm: ${g.final_score}`,
            timestamp: g.graded_at
        }));

        const recentMaterials = await Material.findAll({
            where: { class_id: { [Op.in]: enrolledClassIds } },
            include: [{ model: Class, as: "class", attributes: ["name"] }],
            order: [["created_at", "DESC"]],
            limit: 3
        });

        const formattedMaterials = recentMaterials.map(m => ({
            id: m.id,
            type: "material",
            title: `Tài liệu mới: ${m.title}`,
            detail: m.class?.name || "",
            timestamp: m.created_at
        }));

        const recentActivities = [...formattedGrades, ...formattedMaterials]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 5)
            .map(act => ({
                ...act,
                date: new Date(act.timestamp).toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' })
            }));

        return {
            classes: formattedClasses,
            upcomingAssessmentsCount: formattedAssessments.length,
            upcomingAssessments: formattedAssessments,
            todaySessions: formattedSessions,
            recentActivities
        };
    },

    // ---------------------------------------------------------------
    // My Classes (minh-branch style)
    // ---------------------------------------------------------------
    getMyClasses: async (studentId) => {
        const enrollments = await Enrollment.findAll({
            where: { user_id: studentId },
            include: [
                {
                    model: Class,
                    as: "class",
                    include: [
                        {
                            model: User,
                            as: "teacher",
                            attributes: ["id", "full_name"],
                        },
                        {
                            model: ClassSession,
                            as: "sessions",
                            attributes: ["id", "start_time", "end_time", "room"],
                        }
                    ],
                },
            ],
        });

        return enrollments.map(e => {
            const c = e.class;

            // Format schedule from sessions
            const schedule = (c.sessions || []).map(s => {
                const dayOptions = { weekday: 'long' };
                const timeOptions = { hour: '2-digit', minute: '2-digit' };
                return {
                    day: s.start_time.toLocaleDateString('vi-VN', dayOptions),
                    time: `${s.start_time.toLocaleTimeString('vi-VN', timeOptions)} - ${s.end_time.toLocaleTimeString('vi-VN', timeOptions)}`,
                    room: s.room || 'TBA',
                    rawDate: s.start_time
                };
            });

            return {
                id: c.id,
                name: c.name,
                teacher: c.teacher ? c.teacher.full_name : "N/A",
                room: c.sessions?.[0]?.room || "TBA",
                schedule: schedule
            };
        });
    },

    // ---------------------------------------------------------------
    // Class Details (minh-branch style, with materials/assignments/announcements from dev)
    // ---------------------------------------------------------------
    getClassDetails: async (studentId, classId) => {
        // 1. Check enrollment
        const enrollment = await Enrollment.findOne({
            where: { user_id: studentId, class_id: classId },
        });

        if (!enrollment) {
            throw new Error("You are not enrolled in this class");
        }

        // 2. Class details
        const cl = await Class.findByPk(classId, {
            include: [
                {
                    model: User,
                    as: "teacher",
                    attributes: ["id", "full_name"],
                },
                {
                    model: ClassSession,
                    as: "sessions",
                    attributes: ["start_time", "end_time", "room"],
                    order: [["start_time", "ASC"]]
                }
            ],
        });

        if (!cl) {
            throw new Error("Class not found");
        }

        const studentsCount = await Enrollment.count({ where: { class_id: classId } });

        // 3. Materials
        const materials = await Material.findAll({
            where: { class_id: classId },
            order: [["created_at", "DESC"]],
        });

        // 4. Assessments (published only)
        const assignments = await Assessment.findAll({
            where: { class_id: classId, status: { [Op.ne]: 'draft' } },
            order: [["due_at", "ASC"]],
        });

        // 5. Announcements (Notifications)
        const announcements = [];

        return {
            id: cl.id,
            name: cl.name,
            teacher: cl.teacher ? cl.teacher.full_name : "N/A",
            room: cl.sessions?.[0]?.room || "TBA",
            studentsCount,
            schedule: (cl.sessions || []).map(s => ({
                day: s.start_time.toLocaleDateString('vi-VN', { weekday: 'long' }),
                time: `${s.start_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${s.end_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
                room: s.room || 'TBA'
            })),
            materials: materials.map(m => ({
                id: m.id,
                title: m.title,
                type: m.type,
                updatedAt: m.created_at.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            })),
            assignments: assignments.map(a => ({
                id: a.id,
                title: a.title,
                type: a.type,
                due: a.due_at ? a.due_at.toLocaleString('en-US') : 'No due date',
                points: Number(a.max_score) || 100,
            })),
            announcements: announcements.map(a => ({
                id: a.id,
                title: a.title,
                content: a.message,
                date: a.created_at.toLocaleString('en-US')
            }))
        };
    },

    // ---------------------------------------------------------------
    // Assignment Detail (minh-branch)
    // ---------------------------------------------------------------
    getAssignmentDetail: async (studentId, assessmentId) => {
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [{ model: AssessmentFile, as: 'files' }]
        });

        if (!assessment) throw new Error("Không tìm thấy bài tập.");

        const submission = await Submission.findOne({
            where: {
                assessment_id: assessmentId,
                student_id: studentId
            },
            attributes: ['id', 'assessment_id', 'student_id', 'status', 'submitted_at', 'content_text', 'attempt_no'],
            include: [
                {
                    model: Grade,
                    as: 'grade',
                    attributes: ['final_score', 'final_feedback', 'is_published']
                },
                {
                    model: SubmissionFile,
                    as: 'files',
                    attributes: ['id', 'file_url', 'original_name']
                }
            ]
        });

        return { assessment, submission };
    },

    // ---------------------------------------------------------------
    // Submit Assignment (minh-branch)
    // ---------------------------------------------------------------
    submitAssignment: async (studentId, assessmentId, data) => {
        const assessment = await Assessment.findByPk(assessmentId);
        if (!assessment) throw new Error("Không tìm thấy bài tập.");

        const now = new Date();

        // 1. Kiểm tra đóng cổng (Cutoff)
        if (assessment.cutoff_at && now > new Date(assessment.cutoff_at)) {
            throw new Error("Hệ thống đã đóng cổng nộp bài.");
        }

        // 2. TÍNH TOÁN TRẠNG THÁI NỘP BÀI
        let finalStatus = 'submitted';
        if (assessment.due_at && now > new Date(assessment.due_at)) {
            finalStatus = 'submitted_late';
        }

        return await sequelize.transaction(async (t) => {
            let submission = await Submission.findOne({
                where: { assessment_id: assessmentId, student_id: studentId },
                transaction: t
            });

            if (submission) {
                await submission.update({
                    status: finalStatus,
                    submitted_at: now,
                    content_text: `Sinh viên đã nộp ${data.files ? data.files.length : 0} file`
                }, { transaction: t });
            } else {
                submission = await Submission.create({
                    assessment_id: assessmentId,
                    student_id: studentId,
                    status: finalStatus,
                    submitted_at: now,
                    started_at: now,
                    content_text: `Sinh viên đã nộp ${data.files ? data.files.length : 0} file`
                }, { transaction: t });
            }

            // LƯU FILE VÀO BẢNG SubmissionFile
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                await SubmissionFile.destroy({
                    where: { submission_id: submission.id },
                    transaction: t
                });

                const filesToSave = data.files.map(fileItem => {
                    let fileUrl = typeof fileItem === 'string' ? fileItem : fileItem.url || fileItem.file_url || '';
                    let originalName = fileItem.original_name || fileItem.name;

                    if (!originalName && fileUrl) {
                        originalName = fileUrl.split('/').pop().split(/[?#]/)[0];
                    }

                    let mimeType = 'application/octet-stream';
                    if (originalName) {
                        const lowerName = originalName.toLowerCase();
                        if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
                        else if (lowerName.endsWith('.docx')) mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                        else if (lowerName.endsWith('.doc')) mimeType = 'application/msword';
                        else if (lowerName.endsWith('.zip')) mimeType = 'application/zip';
                        else if (lowerName.endsWith('.png')) mimeType = 'image/png';
                        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
                    }

                    return {
                        submission_id: submission.id,
                        file_url: fileUrl,
                        original_name: originalName || 'uploaded_file',
                        mime_type: mimeType
                    };
                });

                await SubmissionFile.bulkCreate(filesToSave, { transaction: t });
            }

            return submission;
        });
    },

    // ---------------------------------------------------------------
    // Quiz Attempts (dev / nam-branch)
    // ---------------------------------------------------------------

    // UC_STU_09 - Start/Resume attempt
    startOrResumeAttempt: async ({ studentId, quizId }) => {
        const quiz = await loadQuizWithQuestions(quizId);
        const settings = parseQuizSettings(quiz.instructions, quiz.settings_json);

        await ensureStudentEnrolled(studentId, quiz.class_id);
        ensureQuizAvailable(quiz, settings);

        return await sequelize.transaction(async (t) => {
            // 1) Nếu có attempt đang làm dở => resume
            let attempt = await Submission.findOne({
                where: {
                    assessment_id: quizId,
                    student_id: studentId,
                    status: "in_progress",
                },
                order: [["started_at", "DESC"]],
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            // Nếu attempt có nhưng đã hết giờ => auto-submit
            if (attempt) {
                const expiresAt = computeExpiresAt(attempt.started_at, quiz.time_limit_minutes);
                if (expiresAt && new Date() >= expiresAt) {
                    await autoGradeAndFinalize({ submission: attempt, quiz, settings, transaction: t });
                    attempt = null;
                }
            }

            // 2) Nếu không có attempt in_progress => check attempt_limit
            if (!attempt) {
                const finishedCount = await Submission.count({
                    where: {
                        assessment_id: quizId,
                        student_id: studentId,
                        status: ["submitted", "graded"],
                    },
                    transaction: t,
                });

                if (quiz.attempt_limit != null && finishedCount >= quiz.attempt_limit) {
                    throw new ConflictError("Bạn đã vượt quá số lần làm bài cho phép");
                }

                const attemptNo = finishedCount + 1;

                // Build order (shuffle)
                const baseQuestionIds = quiz.questions.map((q) => String(q.id));
                const questionOrder = settings.shuffleQuestions
                    ? shuffleArray(baseQuestionIds)
                    : baseQuestionIds;

                const optionOrder = {};
                for (const q of quiz.questions) {
                    const optIds = (q.options || []).map((o) => String(o.id));
                    optionOrder[String(q.id)] = settings.shuffleQuestions
                        ? shuffleArray(optIds)
                        : optIds;
                }

                attempt = await Submission.create(
                    {
                        assessment_id: quizId,
                        student_id: studentId,
                        attempt_no: attemptNo,
                        status: "in_progress",
                        started_at: new Date(),
                        content_text: buildAttemptMeta({ questionOrder, optionOrder }),
                    },
                    { transaction: t },
                );
            }

            // 3) Prepare response payload
            const meta = parseAttemptMeta(attempt.content_text) || {};
            const qOrder = meta.questionOrder || quiz.questions.map((q) => String(q.id));

            const expiresAt = computeExpiresAt(attempt.started_at, quiz.time_limit_minutes);
            const remain = remainingSeconds(expiresAt);

            return {
                attempt: {
                    id: attempt.id,
                    attemptNo: attempt.attempt_no,
                    status: attempt.status,
                    startedAt: attempt.started_at,
                    expiresAt,
                    remainingSeconds: remain,
                },
                quiz: {
                    id: quiz.id,
                    title: quiz.title,
                    timeLimitMinutes: quiz.time_limit_minutes ?? null,
                },
                questionPalette: qOrder.map((qid, idx) => ({
                    no: idx + 1,
                    questionId: qid,
                })),
            };
        });
    },

    // Load attempt state (questions + options order + current answers)
    getAttemptState: async ({ studentId, submissionId }) => {
        const attempt = await Submission.findByPk(submissionId);
        if (!attempt) throw new NotFoundError("Attempt not found");
        if (String(attempt.student_id) !== String(studentId)) throw new AppError("Forbidden", 403);

        const quiz = await loadQuizWithQuestions(attempt.assessment_id);
        const settings = parseQuizSettings(quiz.instructions);

        // auto-submit if expired
        const expiresAt = computeExpiresAt(attempt.started_at, quiz.time_limit_minutes);
        if (attempt.status === "in_progress" && expiresAt && new Date() >= expiresAt) {
            return await sequelize.transaction(async (t) => {
                const locked = await Submission.findByPk(attempt.id, { transaction: t, lock: t.LOCK.UPDATE });
                if (locked.status === "in_progress") {
                    const result = await autoGradeAndFinalize({ submission: locked, quiz, settings, transaction: t });
                    return { autoSubmitted: true, result };
                }
                return { autoSubmitted: true };
            });
        }

        const meta = parseAttemptMeta(attempt.content_text) || {};
        const qOrder = meta.questionOrder || quiz.questions.map((q) => String(q.id));
        const optionOrder = meta.optionOrder || {};

        const answers = await SubmissionAnswer.findAll({
            where: { submission_id: attempt.id },
        });

        const answerMap = {};
        for (const a of answers) {
            let selectedOptionIds = null;

            if (a.answer_text) {
                try {
                    const parsed = JSON.parse(a.answer_text);
                    if (Array.isArray(parsed?.selectedOptionIds)) {
                        selectedOptionIds = parsed.selectedOptionIds;
                    }
                } catch {
                    // plain text
                }
            }

            answerMap[String(a.question_id)] = {
                selectedOptionId: a.selected_option_id || null,
                selectedOptionIds,
                answerText: selectedOptionIds ? null : (a.answer_text || null),
                isCorrect: a.is_correct,
                score: a.score,
            };
        }

        // Build ordered questions
        const questionById = new Map(quiz.questions.map((q) => [String(q.id), q]));
        const orderedQuestions = qOrder
            .map((qid, idx) => {
                const q = questionById.get(String(qid));
                if (!q) return null;

                const optIds = optionOrder[String(q.id)] || (q.options || []).map((o) => String(o.id));
                const optById = new Map((q.options || []).map((o) => [String(o.id), o]));
                const orderedOpts = optIds
                    .map((oid) => optById.get(String(oid)))
                    .filter(Boolean)
                    .map((o) => ({ id: o.id, text: o.option_text }));

                return {
                    no: idx + 1,
                    id: q.id,
                    text: q.question_text,
                    points: q.points,
                    options: orderedOpts,
                    answer: answerMap[String(q.id)] || null,
                };
            })
            .filter(Boolean);

        return {
            attempt: {
                id: attempt.id,
                attemptNo: attempt.attempt_no,
                status: attempt.status,
                startedAt: attempt.started_at,
                expiresAt,
                remainingSeconds: remainingSeconds(expiresAt),
            },
            quiz: { id: quiz.id, title: quiz.title },
            questions: orderedQuestions,
        };
    },

    // Auto-save answer
    saveAnswer: async ({ studentId, submissionId, questionId, payload }) => {
        const attempt = await Submission.findByPk(submissionId);
        if (!attempt) throw new NotFoundError("Attempt not found");
        if (String(attempt.student_id) !== String(studentId)) throw new AppError("Forbidden", 403);
        if (attempt.status !== "in_progress") throw new ConflictError("Attempt is not in progress");

        const quiz = await loadQuizWithQuestions(attempt.assessment_id);
        const settings = parseQuizSettings(quiz.instructions, quiz.settings_json);

        // auto-submit if expired
        const expiresAt = computeExpiresAt(attempt.started_at, quiz.time_limit_minutes);
        if (expiresAt && new Date() >= expiresAt) {
            return await sequelize.transaction(async (t) => {
                const locked = await Submission.findByPk(attempt.id, { transaction: t, lock: t.LOCK.UPDATE });
                if (locked.status === "in_progress") {
                    const result = await autoGradeAndFinalize({ submission: locked, quiz, settings, transaction: t });
                    return { autoSubmitted: true, result };
                }
                return { autoSubmitted: true };
            });
        }

        // ensure question belongs to quiz
        const q = await QuizQuestion.findOne({
            where: { id: questionId, assessment_id: attempt.assessment_id },
        });
        if (!q) throw new NotFoundError("Question not found in this quiz");

        // upsert
        let ans = await SubmissionAnswer.findOne({
            where: { submission_id: attempt.id, question_id: questionId },
        });

        const updateData = {
            selected_option_id: null,
            answer_text: null,
        };

        if (payload.selectedOptionIds && payload.selectedOptionIds.length > 0) {
            updateData.answer_text = JSON.stringify({ selectedOptionIds: payload.selectedOptionIds });
        } else if (payload.selectedOptionId) {
            updateData.selected_option_id = payload.selectedOptionId;
        } else if (payload.answerText && payload.answerText.trim()) {
            updateData.answer_text = payload.answerText.trim();
        }

        if (!ans) {
            ans = await SubmissionAnswer.create({
                submission_id: attempt.id,
                question_id: questionId,
                ...updateData,
            });
        } else {
            await ans.update(updateData);
        }

        return {
            saved: true,
            submissionId: attempt.id,
            questionId,
        };
    },

    // Summary answered/unanswered
    getAttemptSummary: async ({ studentId, submissionId }) => {
        const attempt = await Submission.findByPk(submissionId);
        if (!attempt) throw new NotFoundError("Attempt not found");
        if (String(attempt.student_id) !== String(studentId)) throw new AppError("Forbidden", 403);

        const quiz = await loadQuizWithQuestions(attempt.assessment_id);
        const meta = parseAttemptMeta(attempt.content_text) || {};
        const qOrder = meta.questionOrder || quiz.questions.map((q) => String(q.id));

        const answers = await SubmissionAnswer.findAll({ where: { submission_id: attempt.id } });
        const answeredSet = new Set();

        for (const a of answers) {
            const hasSingle = !!a.selected_option_id;
            const hasText = !!(a.answer_text && a.answer_text.trim());
            if (hasSingle || hasText) answeredSet.add(String(a.question_id));
        }

        const items = qOrder.map((qid, idx) => ({
            no: idx + 1,
            questionId: qid,
            answered: answeredSet.has(String(qid)),
        }));

        const answeredCount = items.filter((x) => x.answered).length;

        return {
            attemptId: attempt.id,
            status: attempt.status,
            totalQuestions: items.length,
            answeredCount,
            notAnsweredCount: items.length - answeredCount,
            items,
        };
    },

    // Submit attempt (Finish + Submit all)
    submitAttempt: async ({ studentId, submissionId }) => {
        const attempt = await Submission.findByPk(submissionId);
        if (!attempt) throw new NotFoundError("Attempt not found");
        if (String(attempt.student_id) !== String(studentId)) throw new AppError("Forbidden", 403);

        const quiz = await loadQuizWithQuestions(attempt.assessment_id);
        const settings = parseQuizSettings(quiz.instructions, quiz.settings_json);

        if (attempt.status !== "in_progress") {
            throw new ConflictError("Attempt đã được nộp");
        }

        return await sequelize.transaction(async (t) => {
            const locked = await Submission.findByPk(attempt.id, { transaction: t, lock: t.LOCK.UPDATE });
            if (locked.status !== "in_progress") throw new ConflictError("Attempt đã được nộp");

            const result = await autoGradeAndFinalize({
                submission: locked,
                quiz,
                settings,
                transaction: t,
            });

            return result;
        });
    },

    // ---------------------------------------------------------------
    // UC_STU_11: Xem bảng điểm (Gradebook)
    // ---------------------------------------------------------------

    /**
     * Normal Flow: Bảng điểm chi tiết của một lớp
     * - Chỉ hiển thị điểm đã công bố (is_published = true)
     * - Hiển thị structure cho tất cả assessments (kể cả chưa có điểm - E2)
     * - Tính điểm tổng kết dựa trên trọng số (weight)
     */
    getClassGradebook: async (studentId, classId) => {
        // 1. Kiểm tra enrollment (BR_01: chỉ xem điểm của chính mình)
        const enrollment = await Enrollment.findOne({
            where: { user_id: studentId, class_id: classId, status: 'active' }
        });

        if (!enrollment) {
            throw new NotFoundError("Bạn chưa ghi danh vào lớp học này.");
        }

        // 2. Lấy thông tin lớp
        const classInfo = await Class.findByPk(classId, {
            include: [{
                model: User,
                as: 'teacher',
                attributes: ['id', 'full_name']
            }]
        });

        if (!classInfo) {
            throw new NotFoundError("Không tìm thấy lớp học.");
        }

        // 3. Lấy tất cả assessments của lớp (không phải draft)
        const assessments = await Assessment.findAll({
            where: {
                class_id: classId,
                status: { [Op.ne]: 'draft' }
            },
            order: [['created_at', 'ASC']]
        });

        // 4. Lấy tất cả submissions + grades của sinh viên này trong lớp
        const assessmentIds = assessments.map(a => a.id);

        const submissions = await Submission.findAll({
            where: {
                assessment_id: { [Op.in]: assessmentIds },
                student_id: studentId
            },
            include: [{
                model: Grade,
                as: 'grade'
            }],
            order: [['submitted_at', 'DESC']]
        });

        // Map: assessment_id -> best submission (hoặc submission mới nhất)
        const submissionMap = {};
        for (const sub of submissions) {
            const aid = sub.assessment_id;
            // Lấy submission có điểm cao nhất (grade method = highest)
            if (!submissionMap[aid]) {
                submissionMap[aid] = sub;
            } else {
                const currentScore = sub.grade?.final_score != null ? parseFloat(sub.grade.final_score) : -1;
                const existingScore = submissionMap[aid].grade?.final_score != null
                    ? parseFloat(submissionMap[aid].grade.final_score) : -1;
                if (currentScore > existingScore) {
                    submissionMap[aid] = sub;
                }
            }
        }

        // 5. Build grade items
        let weightedScoreSum = 0;
        let weightedMaxSum = 0;
        let totalWeight = 0;

        const gradeItems = assessments.map(assessment => {
            const sub = submissionMap[assessment.id];
            const grade = sub?.grade;
            const maxScore = parseFloat(assessment.max_score) || 100;

            // Parse settings_json for weight
            let weight = null;
            if (assessment.settings_json && assessment.settings_json.weight != null) {
                weight = parseFloat(assessment.settings_json.weight);
            }

            // E1: Điểm chưa được công bố
            const isPublished = !!grade?.is_published;

            // Chỉ lấy điểm đã published
            let score = null;
            let feedback = null;
            let status = 'no_submission'; // Chưa nộp bài

            if (sub) {
                if (sub.status === 'not_submitted') {
                    status = 'not_submitted';
                } else if (!grade) {
                    status = 'submitted'; // Đã nộp, chưa chấm
                } else if (!isPublished) {
                    status = 'hidden'; // E1: Đã chấm nhưng chưa công bố
                } else {
                    status = 'published'; // Đã công bố
                    score = parseFloat(grade.final_score);
                    feedback = grade.final_feedback;
                }
            }

            // Tính weighted sum (chỉ tính điểm đã published)
            if (status === 'published' && weight != null && score != null) {
                weightedScoreSum += (score / maxScore) * weight;
                weightedMaxSum += weight;
                totalWeight += weight;
            } else if (weight != null) {
                totalWeight += weight;
            }

            return {
                assessment_id: assessment.id,
                title: assessment.title,
                type: assessment.type,
                weight: weight,
                max_score: maxScore,
                score: score,
                feedback: feedback,
                status: status,
                due_at: assessment.due_at,
                submitted_at: sub?.submitted_at || null,
                attempt_no: sub?.attempt_no || null
            };
        });

        // 6. Tính điểm tổng kết (Course Total)
        let courseTotal = null;
        if (weightedMaxSum > 0) {
            // Tính theo trọng số đã có điểm
            courseTotal = Math.round((weightedScoreSum / weightedMaxSum) * 100 * 100) / 100;
        } else {
            // Fallback: Tính trung bình nếu không có weight
            const publishedItems = gradeItems.filter(g => g.status === 'published' && g.score != null);
            if (publishedItems.length > 0) {
                const totalPercent = publishedItems.reduce((sum, g) => sum + (g.score / g.max_score) * 100, 0);
                courseTotal = Math.round((totalPercent / publishedItems.length) * 100) / 100;
            }
        }

        return {
            class: {
                id: classInfo.id,
                name: classInfo.name,
                teacher: classInfo.teacher?.full_name || 'N/A'
            },
            grade_items: gradeItems,
            course_total: courseTotal,
            total_weight: totalWeight
        };
    },

    /**
     * A1: Tổng quan điểm các môn (Grade Overview)
     * Hiển thị tất cả lớp enrolled + điểm tổng kết hiện tại
     */
    getGradesOverview: async (studentId) => {
        // 1. Lấy tất cả enrollments
        const enrollments = await Enrollment.findAll({
            where: { user_id: studentId, status: 'active' },
            include: [{
                model: Class,
                as: 'class',
                include: [{
                    model: User,
                    as: 'teacher',
                    attributes: ['id', 'full_name']
                }]
            }]
        });

        const results = [];

        for (const enrollment of enrollments) {
            const cl = enrollment.class;

            // Lấy assessments
            const assessments = await Assessment.findAll({
                where: {
                    class_id: cl.id,
                    status: { [Op.ne]: 'draft' }
                }
            });

            const assessmentIds = assessments.map(a => a.id);

            if (assessmentIds.length === 0) {
                results.push({
                    class_id: cl.id,
                    class_name: cl.name,
                    teacher: cl.teacher?.full_name || 'N/A',
                    course_total: null,
                    published_count: 0,
                    total_assessments: 0
                });
                continue;
            }

            // Lấy submissions có grade published
            const submissions = await Submission.findAll({
                where: {
                    assessment_id: { [Op.in]: assessmentIds },
                    student_id: studentId
                },
                include: [{
                    model: Grade,
                    as: 'grade',
                    where: { is_published: true },
                    required: true
                }]
            });

            // Giữ submission tốt nhất cho mỗi assessment
            const bestByAssessment = {};
            for (const sub of submissions) {
                const aid = sub.assessment_id;
                const score = parseFloat(sub.grade.final_score) || 0;
                if (!bestByAssessment[aid] || score > bestByAssessment[aid].score) {
                    bestByAssessment[aid] = { score, maxScore: 0 };
                }
            }

            // Map max_score
            for (const a of assessments) {
                if (bestByAssessment[a.id]) {
                    bestByAssessment[a.id].maxScore = parseFloat(a.max_score) || 100;
                }
            }

            const publishedEntries = Object.values(bestByAssessment);
            let courseTotal = null;

            if (publishedEntries.length > 0) {
                const totalPercent = publishedEntries.reduce(
                    (sum, e) => sum + (e.score / e.maxScore) * 100, 0
                );
                courseTotal = Math.round((totalPercent / publishedEntries.length) * 100) / 100;
            }

            results.push({
                class_id: cl.id,
                class_name: cl.name,
                teacher: cl.teacher?.full_name || 'N/A',
                course_total: courseTotal,
                published_count: publishedEntries.length,
                total_assessments: assessments.length
            });
        }

        return results;
    }
};

