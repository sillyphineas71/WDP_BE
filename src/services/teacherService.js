// src/services/teacherService.js
import { Op } from "sequelize";
import { sequelize, Class, Assessment, Course, AssessmentFile, Submission, SubmissionFile, SubmissionAnswer, Grade, User, ClassSession, QuizQuestion, QuizOption, Enrollment, Notification } from "../models/index.js";
import { AppError, NotFoundError, ValidationError, ConflictError } from "../errors/AppError.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth";

// Nhét cấu hình quiz vào instructions (dev branch)
function buildInstructionsWithMeta(instructions, meta) {
    const text = (instructions ?? "").trim();
    const metaBlock =
        "\n\n---\n[quiz_settings]\n" + JSON.stringify(meta, null, 2);
    return text ? text + metaBlock : metaBlock.trim();
}

/**
 * Parse quiz settings from instructions or settings_json
 */
function parseQuizSettings(instructions, settingsJson) {
    if (settingsJson && typeof settingsJson === 'object' && Object.keys(settingsJson).length > 0) {
        return settingsJson;
    }
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

export const teacherService = {

    // ================================================================
    // Dev branch (nam-branch): Quiz / Assignment / Grades
    // ================================================================

    /**
     * GET classes that teacher manages (dev branch)
     */
    getClassesByTeacher: async (teacherId) => {
        try {
            // 1. Fetch classes
            const classes = await Class.findAll({
                where: { teacher_id: teacherId },
                include: [{ model: Course, as: 'course' }],
                order: [['created_at', 'DESC']]
            });

            console.log(`[DEBUG_TEACHER] Found ${classes.length} classes`);

            const result = [];
            for (const c of classes) {
                // 2. Fetch enrollment count separately
                const enrollmentCount = await Enrollment.count({
                    where: { class_id: c.id }
                });

                // 3. Fetch sessions separately
                const sessions = await ClassSession.findAll({
                    where: { class_id: c.id },
                    order: [['start_time', 'ASC']]
                });

                const schedule = sessions.map(s => {
                    const dayOptions = { weekday: 'long' };
                    const timeOptions = { hour: '2-digit', minute: '2-digit' };
                    try {
                        return {
                            day: s.start_time.toLocaleDateString('vi-VN', dayOptions),
                            time: `${s.start_time.toLocaleTimeString('vi-VN', timeOptions)} - ${s.end_time.toLocaleTimeString('vi-VN', timeOptions)}`,
                            room: s.room || 'TBA',
                            rawDate: s.start_time
                        };
                    } catch (e) {
                        return { day: "CXĐ", time: "CXĐ", room: s.room || "TBA" };
                    }
                });

                console.log(`[DEBUG_CLASS] ${c.name}: Enrollments=${enrollmentCount}, Sessions=${sessions.length}`);

                result.push({
                    id: c.id,
                    name: c.name,
                    status: c.status,
                    courseName: c.course?.name,
                    courseCode: c.course?.code,
                    course: c.course,
                    studentCount: enrollmentCount,
                    room: sessions[0]?.room || "TBA",
                    schedule: schedule,
                    startDate: c.start_date,
                    endDate: c.end_date
                });
            }

            return result;
        } catch (err) {
            console.error("[ERROR_TEACHER_SERVICE]", err);
            throw err;
        }
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
                    settings_json: settingsMeta,
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

    updateQuizStatus: async (teacherId, classId, quizId, status) => {
        const assessment = await Assessment.findOne({
            where: { id: quizId, class_id: classId, created_by: teacherId, type: 'QUIZ' }
        });
        if (!assessment) throw new NotFoundError("Bài kiểm tra không tồn tại hoặc bạn không quản lý lớp này.");

        await assessment.update({ status });
        return assessment;
    },

    /**
     * GET only QUIZ assessments for a specific class
     */
    getQuizzesByClass: async (teacherId, classId) => {
        const clazz = await Class.findByPk(classId);
        if (!clazz) throw new NotFoundError("Class not found");
        if (String(clazz.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: not owner teacher of this class", 403);
        }

        const quizzes = await Assessment.findAll({
            where: { class_id: classId, type: "QUIZ" },
            include: [
                {
                    model: QuizQuestion,
                    as: "questions",
                    attributes: ["id"]
                },
                {
                    model: Submission,
                    as: "submissions",
                    attributes: ["id"]
                }
            ],
            order: [["created_at", "DESC"]]
        });

        return quizzes.map(q => ({
            id: q.id,
            title: q.title,
            max_score: q.max_score,
            status: q.status,
            dueAt: q.due_at,
            timeLimit: q.time_limit_minutes,
            attemptLimit: q.attempt_limit,
            questionCount: q.questions?.length || 0,
            submissionCount: q.submissions?.length || 0,
            createdAt: q.created_at
        }));
    },

    /**
     * GET quiz detail
     */
    getQuizDetail: async (teacherId, classId, quizId) => {
        const quiz = await Assessment.findOne({
            where: { id: quizId, class_id: classId, type: "QUIZ" },
        });

        if (!quiz) throw new NotFoundError("Quiz not found");

        // Verify teacher ownership
        const clazz = await Class.findByPk(classId);
        if (!clazz || String(clazz.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: not owner teacher of this class", 403);
        }

        return quiz;
    },

    /**
     * UC_TEA_08: Update QUIZ assessment
     */
    updateQuiz: async (teacherId, classId, quizId, payload) => {
        const clazz = await Class.findByPk(classId);
        if (!clazz) throw new NotFoundError("Class not found");
        if (String(clazz.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: not owner teacher of this class", 403);
        }

        const quiz = await Assessment.findOne({
            where: { id: quizId, class_id: classId, type: "QUIZ" }
        });
        if (!quiz) throw new NotFoundError("Quiz not found");

        let attemptLimit = payload.attemptLimit ?? quiz.attempt_limit;
        if (attemptLimit === 0) attemptLimit = null;
        if (attemptLimit !== null && attemptLimit < 1) {
            throw new ValidationError("attemptLimit must be >= 1 (or 0 for unlimited)");
        }

        const timeLimit = payload.timeLimitMinutes !== undefined ? payload.timeLimitMinutes : quiz.time_limit_minutes;
        const dueAt = payload.closeAt !== undefined ? payload.closeAt : quiz.due_at;
        
        const currentSettings = quiz.settings_json || {};
        const settingsMeta = {
            openAt: payload.openAt !== undefined ? payload.openAt : currentSettings.openAt,
            closeAt: payload.closeAt !== undefined ? payload.closeAt : currentSettings.closeAt,
            gradeMethod: payload.gradeMethod ?? currentSettings.gradeMethod ?? "highest",
            shuffleQuestions: payload.shuffleQuestions !== undefined ? !!payload.shuffleQuestions : !!currentSettings.shuffleQuestions,
            reviewOption: payload.reviewOption ?? currentSettings.reviewOption ?? "after_submit"
        };

        const instructions = buildInstructionsWithMeta(
            payload.instructions !== undefined ? payload.instructions : quiz.instructions?.split("\n\n---")[0] || "",
            settingsMeta
        );

        return await sequelize.transaction(async (t) => {
            await quiz.update({
                title: payload.title || quiz.title,
                instructions,
                due_at: dueAt,
                time_limit_minutes: timeLimit,
                attempt_limit: attemptLimit,
                settings_json: settingsMeta,
                status: payload.status || quiz.status
            }, { transaction: t });
            
            return {
                id: quiz.id,
                type: quiz.type,
                status: quiz.status,
                classId,
                next: `/teacher/classes/${classId}/quizzes/${quiz.id}/questions`
            };
        });
    },

    /**
     * UC_TEA_10: Create ESSAY assessment (Assignment) - dev branch
     */
    createAssignment: async (teacherId, classId, payload) => {
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

        const dueAt = payload.closeAt ?? null;

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

        const assignment = await sequelize.transaction(async (t) => {
            return Assessment.create(
                {
                    class_id: classId,
                    created_by: teacherId,
                    type: "ESSAY",
                    title: payload.title,
                    instructions,
                    due_at: dueAt,
                    status: payload.status || "published"
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
    /**
     * UC_TEA_15: Publish or Unpublish Grades for an Assessment
     * 
     * publish_mode:
     *   - "graded_only": Chỉ công bố cho SV đã được chấm (Normal Flow Bước 4 - Tùy chọn 1)
     *   - "all_students": Công bố cho toàn bộ SV, tạo Grade 0 cho SV chưa nộp (Bước 4 - Tùy chọn 2)
     * 
     * A1: Ẩn lại điểm (is_published = false) -> unpublish tất cả
     */
    publishAssessmentGrades: async (teacherId, classId, assessmentId, isPublished, publishMode = 'graded_only') => {
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

        const assessment = await Assessment.findOne({
            where: { id: assessmentId, class_id: classId }
        });

        if (!assessment) {
            throw new NotFoundError("Assessment not found in this class");
        }

        return await sequelize.transaction(async (t) => {
            const updateData = {
                is_published: isPublished,
                published_at: isPublished ? new Date() : null
            };

            // Lấy tất cả submissions
            const submissions = await Submission.findAll({
                where: { assessment_id: assessmentId },
                include: [{ model: Grade, as: 'grade' }],
                transaction: t
            });

            // --- TRƯỜNG HỢP UNPUBLISH (A1: Ẩn lại điểm) ---
            if (!isPublished) {
                const submissionIds = submissions.map(s => s.id);
                if (submissionIds.length === 0) {
                    return { message: "Không có dữ liệu điểm nào để ẩn.", updatedCount: 0 };
                }

                const [updatedRowCount] = await Grade.update(updateData, {
                    where: { submission_id: submissionIds },
                    transaction: t
                });

                return {
                    message: `Đã ẩn điểm thành công.`,
                    updatedCount: updatedRowCount
                };
            }

            // --- TRƯỜNG HỢP PUBLISH ---

            // E1: Kiểm tra đã có Grade nào được chấm chưa
            const gradedSubmissions = submissions.filter(s => s.grade && s.grade.final_score != null);

            if (gradedSubmissions.length === 0 && publishMode === 'graded_only') {
                throw new AppError(
                    "Chưa có dữ liệu điểm nào để công bố. Vui lòng chấm bài trước.",
                    400
                );
            }

            let updatedCount = 0;
            const notifiedStudentIds = [];

            if (publishMode === 'graded_only') {
                // Tùy chọn 1: Chỉ công bố cho SV đã được chấm
                const gradedSubmissionIds = gradedSubmissions.map(s => s.id);

                const [count] = await Grade.update(updateData, {
                    where: { submission_id: gradedSubmissionIds },
                    transaction: t
                });
                updatedCount = count;

                // Ghi nhận SV cần thông báo
                for (const sub of gradedSubmissions) {
                    notifiedStudentIds.push(sub.student_id);
                }

            } else if (publishMode === 'all_students') {
                // Tùy chọn 2: Công bố cho toàn bộ SV (kể cả chưa nộp -> 0 điểm)

                // Cập nhật Grade cho SV đã có submission + grade
                const existingGradeSubIds = submissions
                    .filter(s => s.grade)
                    .map(s => s.id);

                if (existingGradeSubIds.length > 0) {
                    const [count] = await Grade.update(updateData, {
                        where: { submission_id: existingGradeSubIds },
                        transaction: t
                    });
                    updatedCount += count;
                }

                // Tạo Grade cho SV đã nộp nhưng chưa có Grade
                const noGradeSubmissions = submissions.filter(s => !s.grade);
                for (const sub of noGradeSubmissions) {
                    await Grade.create({
                        submission_id: sub.id,
                        final_score: 0,
                        final_feedback: "Chưa được chấm điểm.",
                        graded_by: teacherId,
                        graded_at: new Date(),
                        is_published: true,
                        published_at: new Date(),
                        status: 'graded'
                    }, { transaction: t });
                    updatedCount++;
                }

                // Tìm SV enrolled nhưng chưa nộp bài -> tạo Submission + Grade = 0
                const enrollments = await Enrollment.findAll({
                    where: { class_id: classId, status: 'active' },
                    transaction: t
                });

                const submittedStudentIds = new Set(submissions.map(s => s.student_id));

                for (const enrollment of enrollments) {
                    if (!submittedStudentIds.has(enrollment.user_id)) {
                        // Tạo Submission rỗng
                        const newSubmission = await Submission.create({
                            assessment_id: assessmentId,
                            student_id: enrollment.user_id,
                            attempt_no: 1,
                            status: 'not_submitted',
                            submitted_at: new Date()
                        }, { transaction: t });

                        // Tạo Grade = 0
                        await Grade.create({
                            submission_id: newSubmission.id,
                            final_score: 0,
                            final_feedback: "Không nộp bài.",
                            graded_by: teacherId,
                            graded_at: new Date(),
                            is_published: true,
                            published_at: new Date(),
                            status: 'graded'
                        }, { transaction: t });

                        updatedCount++;
                    }
                }

                // Toàn bộ SV enrolled cần thông báo
                for (const enrollment of enrollments) {
                    notifiedStudentIds.push(enrollment.user_id);
                }
            }

            // Gửi thông báo in-app cho sinh viên
            if (notifiedStudentIds.length > 0) {
                const notifications = notifiedStudentIds.map(studentId => ({
                    user_id: studentId,
                    channel: 'in_app',
                    title: 'Điểm đã được công bố',
                    body: `Điểm bài "${assessment.title}" đã được giáo viên công bố. Vào trang điểm để xem kết quả.`,
                    ref_type: 'GRADE',
                    ref_id: assessmentId,
                    status: 'sent',
                    sent_at: new Date()
                }));

                await Notification.bulkCreate(notifications, { transaction: t });
            }

            return {
                message: `Đã công bố điểm thành công cho ${updatedCount} sinh viên.`,
                updatedCount,
                publish_mode: publishMode
            };
        });
    },

    // ================================================================
    // Minh-branch: Essay Assessment CRUD & Grading & AI
    // ================================================================

    createEssayAssessment: async (teacherId, classId, data) => {
        const cls = await Class.findOne({ where: { id: classId, teacher_id: teacherId } });
        if (!cls) {
            throw new NotFoundError("Lớp học không tồn tại hoặc bạn không quản lý lớp này.");
        }

        if (data.allow_from && data.due_at) {
            if (new Date(data.allow_from) > new Date(data.due_at)) {
                throw new ConflictError("Thời gian bắt đầu nhận bài (Allow from) phải diễn ra trước Hạn nộp (Due date).");
            }
        }
        if (data.due_at && data.cutoff_at) {
            if (new Date(data.due_at) > new Date(data.cutoff_at)) {
                throw new ConflictError("Hạn nộp (Due date) phải diễn ra trước Thời gian đóng cổng (Cut-off date).");
            }
        }
        if (data.allow_from && data.cutoff_at) {
            if (new Date(data.allow_from) > new Date(data.cutoff_at)) {
                throw new ConflictError("Thời gian bắt đầu nhận bài phải diễn ra trước Thời gian đóng cổng.");
            }
        }

        if (!data.settings.online_text && !data.settings.file_submission) {
            throw new ConflictError("Vui lòng chọn ít nhất một hình thức nộp bài (Nộp file hoặc Gõ văn bản).");
        }

        return await sequelize.transaction(async (t) => {
            const assessment = await Assessment.create(
                {
                    class_id: classId,
                    created_by: teacherId,
                    type: "ESSAY",
                    title: data.title,
                    instructions: data.instructions,
                    allow_from: data.allow_from,
                    due_at: data.due_at,
                    cutoff_at: data.cutoff_at,
                    max_score: data.max_score,
                    settings_json: data.settings,
                    status: data.status,
                },
                { transaction: t }
            );

            if (data.files && data.files.length > 0) {
                const fileRecords = data.files.map((file) => ({
                    assessment_id: assessment.id,
                    file_url: file.file_url,
                    original_name: file.original_name,
                    mime_type: file.mime_type,
                    uploaded_by: teacherId,
                }));
                await AssessmentFile.bulkCreate(fileRecords, { transaction: t });
            }

            return await Assessment.findByPk(assessment.id, {
                include: [{ model: AssessmentFile, as: "files" }],
                transaction: t,
            });
        });
    },

    getAssignmentsByClass: async (teacherId, classId) => {
        const cls = await Class.findOne({ 
            where: { id: classId, teacher_id: teacherId },
            include: [{ model: Course, as: "course", attributes: ["name"] }]
        });
        if (!cls) {
            throw new NotFoundError("Lớp học không tồn tại hoặc bạn không quản lý lớp này.");
        }

        const assessments = await Assessment.findAll({
            where: { class_id: classId },
            include: [
                {
                    model: AssessmentFile,
                    as: "files",
                    attributes: ["id", "file_url", "original_name"],
                },
            ],
            order: [["created_at", "DESC"]],
        });

        // Auto-close expired published assessments (supplement to the 30-min cron job)
        const now = new Date();
        const autoClosePromises = assessments
            .filter(a => {
                const deadline = a.cutoff_at ? new Date(a.cutoff_at) : (a.due_at ? new Date(a.due_at) : null);
                return a.status === 'published' && deadline && now > deadline;
            })
            .map(a => {
                a.status = 'closed'; // Update in-memory so the returned list is already correct
                return a.update({ status: 'closed' }).catch(err =>
                    console.error(`[AutoClose] Lỗi khi tự động đóng assessment ${a.id}:`, err)
                );
            });

        if (autoClosePromises.length > 0) {
            await Promise.all(autoClosePromises);
            console.log(`[AutoClose] Đã tự động đóng ${autoClosePromises.length} bài tập quá hạn trong lớp ${classId}.`);
        }

        return {
            assessments: assessments,
            class: cls
        };
    },


    getMyClasses: async (teacherId) => {
        const classes = await Class.findAll({
            where: { teacher_id: teacherId, status: 'active' },
            include: [
                { model: Course, as: 'course', attributes: ['name', 'code'] },
                {
                    model: ClassSession,
                    as: 'sessions',
                    attributes: ['id', 'start_time', 'end_time', 'room'],
                }
            ],
            order: [['created_at', 'DESC']]
        });

        return classes.map(c => {
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
                status: c.status,
                course: c.course,
                room: c.sessions?.[0]?.room || "TBA",
                schedule: schedule
            };
        });
    },

    updateEssayAssessment: async (teacherId, classId, assessmentId, data) => {
        const assessment = await Assessment.findOne({
            where: { id: assessmentId, class_id: classId, created_by: teacherId }
        });
        if (!assessment) throw new NotFoundError("Không tìm thấy bài tập hoặc bạn không có quyền sửa.");

        return await sequelize.transaction(async (t) => {
            await assessment.update({
                title: data.title,
                instructions: data.instructions,
                allow_from: data.allow_from,
                due_at: data.due_at,
                cutoff_at: data.cutoff_at,
                max_score: data.max_score,
                settings_json: data.settings,
                status: data.status
            }, { transaction: t });

            if (data.files) {
                await AssessmentFile.destroy({ where: { assessment_id: assessmentId }, transaction: t });
                const fileRecords = data.files.map(file => ({
                    assessment_id: assessmentId,
                    file_url: file.file_url,
                    original_name: file.original_name,
                    mime_type: file.mime_type,
                    uploaded_by: teacherId
                }));
                await AssessmentFile.bulkCreate(fileRecords, { transaction: t });
            }

            return assessment;
        });
    },

    deleteAssessment: async (teacherId, assessmentId) => {
        const assessment = await Assessment.findOne({ where: { id: assessmentId, created_by: teacherId } });
        if (!assessment) throw new NotFoundError("Bài tập không tồn tại.");

        return await assessment.destroy();
    },

    getSubmissionsByAssessment: async (teacherId, assessmentId) => {
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [
                {
                    model: Class,
                    as: 'class',
                },
                {
                    model: AssessmentFile,
                    as: 'files',
                    attributes: ['id', 'file_url', 'original_name']
                }
            ]
        });

        if (!assessment || assessment.class.teacher_id !== teacherId) {
            throw new NotFoundError("Không tìm thấy bài tập.");
        }

        // Lấy toàn bộ học sinh trong lớp
        const enrollments = await Enrollment.findAll({
            where: { class_id: assessment.class_id },
            include: [
                { model: User, as: 'student', attributes: ['id', 'full_name', 'email', 'avatar_url'] }
            ]
        });

        const submissions = await Submission.findAll({
            where: { assessment_id: assessmentId },
            include: [
                { model: Grade, as: 'grade', attributes: ['final_score', 'is_published'] }
            ],
            order: [['submitted_at', 'DESC']]
        });

        const processedSubmissions = enrollments.map(e => {
            const sub = submissions.find(s => s.student_id === e.user_id);
            if (sub) {
                const subJson = sub.toJSON();
                let isCheat = false;
                try {
                    if (subJson.content_text) {
                        const meta = JSON.parse(subJson.content_text);
                        isCheat = !!meta.isCheat;
                    }
                } catch (err) {}
                subJson.is_cheat = isCheat;
                return { ...subJson, student: e.student ? e.student.toJSON() : null };
            } else {
                return {
                    id: `unsub-${e.student_id}`,
                    student_id: e.student_id,
                    assessment_id: assessmentId,
                    status: 'unsubmitted',
                    submitted_at: null,
                    student: e.student ? e.student.toJSON() : null,
                    grade: null
                };
            }
        });

        processedSubmissions.sort((a, b) => {
            const aSubmitted = a.status !== 'unsubmitted';
            const bSubmitted = b.status !== 'unsubmitted';

            if (aSubmitted && !bSubmitted) return -1;
            if (!aSubmitted && bSubmitted) return 1;

            if (aSubmitted && bSubmitted) {
                return new Date(a.submitted_at) - new Date(b.submitted_at);
            }
            return 0;
        });

        const studentCount = await Enrollment.count({ where: { class_id: assessment.class_id } });

        return {
            assessment: assessment,
            submissions: processedSubmissions,
            studentCount: studentCount
        };
    },

    getStudentsByClass: async (teacherId, classId) => {
        const cls = await Class.findByPk(classId);
        if (!cls || cls.teacher_id !== teacherId) {
            throw new NotFoundError("Không tìm thấy lớp học.");
        }

        const enrollments = await Enrollment.findAll({
            where: { class_id: classId },
            include: [
                { model: User, as: 'student', attributes: ['id', 'full_name', 'email', 'avatar_url'] }
            ]
        });

        return enrollments.map(e => ({
            id: e.id,
            user_id: e.user_id,
            status: e.status,
            enrolled_date: e.enrolled_date,
            student: e.student ? e.student.toJSON() : null
        }));
    },

    // ==========================================
    // CÁC HÀM CHẤM ĐIỂM (minh-branch)
    // ==========================================

    getSubmissionForGrading: async (submissionId) => {
        const submission = await Submission.findByPk(submissionId, {
            include: [
                {
                    model: User,
                    as: 'student',
                    attributes: ['id', 'full_name', 'email', 'avatar_url']
                },
                {
                    model: SubmissionFile,
                    as: 'files',
                    attributes: ['id', 'file_url', 'original_name', 'mime_type']
                },
                {
                    model: Grade,
                    as: 'grade'
                },
                {
                    model: Assessment,
                    as: 'assessment',
                    attributes: ['id', 'title', 'max_score', 'instructions', 'due_at'],
                    include: [{
                        model: AssessmentFile,
                        as: 'files',
                        attributes: ['id', 'file_url', 'original_name']
                    }]
                }
            ]
        });

        if (!submission) throw new Error("Không tìm thấy bài nộp.");
        
        const subJson = submission.toJSON();
        let isCheat = false;
        try {
            if (subJson.content_text) {
                const meta = JSON.parse(subJson.content_text);
                isCheat = !!meta.isCheat;
            }
        } catch (e) {}
        subJson.is_cheat = isCheat;

        return subJson;
    },

    gradeSubmission: async (teacherId, submissionId, gradeData) => {
        return await sequelize.transaction(async (t) => {
            const submission = await Submission.findByPk(submissionId, { transaction: t });
            if (!submission) throw new Error("Bài nộp không tồn tại.");

            const { final_score, final_feedback, is_published } = gradeData;

            let grade = await Grade.findOne({ where: { submission_id: submissionId }, transaction: t });

            if (grade) {
                await grade.update({
                    final_score,
                    final_feedback,
                    graded_by: teacherId,
                    graded_at: new Date(),
                    is_published: is_published || false
                }, { transaction: t });
            } else {
                grade = await Grade.create({
                    submission_id: submissionId,
                    final_score,
                    final_feedback,
                    graded_by: teacherId,
                    graded_at: new Date(),
                    is_published: is_published || false
                }, { transaction: t });
            }

            await submission.update({ status: 'graded' }, { transaction: t });

            return grade;
        });
    },

    aiGradeSubmission: async (submissionId) => {
        // 1. Lấy thông tin bài nộp
        const submission = await Submission.findByPk(submissionId, {
            include: [
                {
                    model: Assessment,
                    as: 'assessment',
                    attributes: ['title', 'instructions', 'max_score'],
                    include: [{ model: AssessmentFile, as: 'files', attributes: ['file_url', 'original_name'] }]
                },
                {
                    model: SubmissionFile,
                    as: 'files',
                    attributes: ['file_url', 'original_name', 'mime_type']
                }
            ]
        });

        if (!submission) throw new Error("Không tìm thấy bài nộp.");

        // 2. Khởi tạo Gemini AI
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        // 3. Chuẩn bị mảng dữ liệu gửi cho Gemini
        let requestData = [];

        requestData.push(`Bạn là một giáo viên đại học khách quan và công tâm đang chấm bài tập.
    - Tiêu đề bài tập: "${submission.assessment.title}"
    - Hướng dẫn cơ bản: "${submission.assessment.instructions || 'Không có yêu cầu thêm'}"
    - Thang điểm tối đa: ${submission.assessment.max_score}
    - Lời nhắn của sinh viên khi nộp: "${submission.content_text || 'Không có'}"\n`);

        // HÀM HỖ TRỢ XỬ LÝ FILE
        const processFile = async (fileObj, roleLabel) => {
            try {
                const fileName = fileObj.original_name.toLowerCase();
                const response = await fetch(fileObj.file_url);
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);

                if (fileName.endsWith('.docx')) {
                    const result = await mammoth.extractRawText({ buffer: buffer });
                    requestData.push(`\n--- [NỘI DUNG TEXT TỪ ${roleLabel}: ${fileObj.original_name}] ---\n${result.value}\n`);
                }
                else if (fileName.endsWith('.pdf') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
                    let mimeType = fileName.endsWith('.pdf') ? "application/pdf" : (fileName.endsWith('.png') ? "image/png" : "image/jpeg");
                    requestData.push(`\n--- [FILE TÀI LIỆU TỪ ${roleLabel}: ${fileObj.original_name}] ---`);
                    requestData.push({
                        inlineData: { data: buffer.toString("base64"), mimeType: mimeType }
                    });
                } else {
                    console.log(`Bỏ qua file ${fileName} do định dạng chưa được AI hỗ trợ.`);
                }
            } catch (error) {
                console.error(`Lỗi xử lý file ${fileObj.original_name}:`, error);
            }
        };

        // 4. XỬ LÝ FILE ĐỀ BÀI (Của giáo viên)
        if (submission.assessment.files && submission.assessment.files.length > 0) {
            requestData.push("\n========== CHI TIẾT ĐỀ BÀI VÀ YÊU CẦU ==========");
            for (const tFile of submission.assessment.files) {
                await processFile(tFile, "GIÁO VIÊN");
            }
        }

        // 5. XỬ LÝ FILE BÀI LÀM (Của sinh viên)
        if (submission.files && submission.files.length > 0) {
            requestData.push("\n========== BÀI LÀM CỦA SINH VIÊN ==========");
            for (const sFile of submission.files) {
                await processFile(sFile, "SINH VIÊN");
            }
        } else {
            requestData.push("\n========== BÀI LÀM CỦA SINH VIÊN ==========\n(Sinh viên không nộp file đính kèm nào)");
        }

        // 6. CÂU CHỐT NHIỆM VỤ CHO AI
        requestData.push(`\n========== NHIỆM VỤ CHẤM BÀI ==========
    Nhiệm vụ: Đọc kỹ tài liệu CHI TIẾT ĐỀ BÀI ở trên (nếu có) để nắm barem/câu hỏi, sau đó đối chiếu với BÀI LÀM CỦA SINH VIÊN.
    
    Yêu cầu đánh giá CHẶT CHẼ và CHÍNH XÁC:
    1. **KHÔNG ĐƯỢC tự mâu thuẫn**: Nếu sinh viên chọn hoặc giải ĐÚNG, bạn hãy ghi nhận ĐÚNG. Tuyệt đối tránh lỗi nhận xét mâu thuẫn (nhận định đúng là A, chọn A là đúng, nhưng liệt kê vào lỗi sai).
    2. **Đánh giá Trắc nghiệm (MCQ)**: Kiểm tra chính xác Đáp án (A,B,C,D). Không bắt bẻ hình thức nếu sinh viên đã khoanh đúng chữ cái.
    3. **Đánh giá Tự luận**: Chỉ ra bước biến đổi sai (nếu có) trước khi trừ điểm.
    4. **Cách tính Điểm**: Chấm trên thang tối đa là ${submission.assessment.max_score}. Sinh viên đạt kết quả ĐÚNG 100% thì PHẢI chấm điểm TỐI ĐA.

    BẮT BUỘC trả về kết quả dưới dạng JSON có đúng 2 trường sau:
    {
      "suggested_score": <số điểm>,
      "feedback": "<nhận xét chi tiết>"
    }`);

        // 7. GỬI REQUEST CHO GEMINI
        try {
            const result = await model.generateContent(requestData);
            const responseText = result.response.text();
            return JSON.parse(responseText);
        } catch (error) {
            console.error("Lỗi khi gọi AI:", error);
            throw new Error("AI không phản hồi hoặc phản hồi sai định dạng JSON.");
        }
    },

    /**
     * UC_TEA_16: Get Teacher Dashboard Data
     */
    getDashboard: async (teacherId) => {
        const Op = sequelize.Sequelize.Op;
        const now = new Date();
        const startOfToday = new Date(now.setHours(0, 0, 0, 0));
        const endOfToday = new Date(now.setHours(23, 59, 59, 999));

        // 1. Lọc Lớp học của giáo viên phụ trách
        const classes = await Class.findAll({
            where: { teacher_id: teacherId },
            include: [
                { model: Course, as: "course", attributes: ["name"] },
            ],
            order: [["created_at", "DESC"]]
        });

        const classIds = classes.map(c => c.id);

        // 2. Lịch dạy hôm nay
        const todaySessions = await ClassSession.findAll({
            where: {
                class_id: { [Op.in]: classIds },
                start_time: {
                    [Op.between]: [startOfToday, endOfToday]
                }
            },
            include: [{ model: Class, as: "class", attributes: ["name"] }],
            order: [["start_time", "ASC"]]
        });

        // 3. To-do / Needs Grading (Bài tập có bài nộp chờ chấm)
        const needsGradingSubmissions = await Submission.findAll({
            where: {
                status: 'submitted'
            },
            include: [
                {
                    model: Assessment, as: "assessment",
                    where: { class_id: { [Op.in]: classIds } },
                    attributes: ["id", "title", "due_at", "class_id", "type"],
                    include: [{ model: Class, as: "class", attributes: ["name"] }]
                },
                {
                    model: User,
                    as: "student",
                    attributes: ["id", "full_name"]
                }
            ],
            order: [["submitted_at", "ASC"]]
        });

        // 4. Thống kê theo bài tập cụ thể cho To-do List Widget
        const toGradingStats = {};
        needsGradingSubmissions.forEach(sub => {
            const assId = sub.assessment.id;
            if (!toGradingStats[assId]) {
                toGradingStats[assId] = {
                    assessmentId: assId,
                    classId: sub.assessment.class_id,
                    title: sub.assessment.title,
                    className: sub.assessment.class?.name,
                    dueAt: sub.assessment.due_at,
                    type: sub.assessment.type,
                    count: 0
                };
            }
            toGradingStats[assId].count += 1;
        });

        const needsGradingList = Object.values(toGradingStats);

        // 5. Thống kê sĩ số & tiến độ lớp học
        const classDetails = await Promise.all(classes.map(async (c) => {
            const studentCount = await Enrollment.count({ where: { class_id: c.id } });

            const totalSessions = await ClassSession.count({ where: { class_id: c.id } });
            const completedSessions = await ClassSession.count({
                where: {
                    class_id: c.id,
                    end_time: { [Op.lt]: new Date() }
                }
            });
            const progress = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

            return {
                id: c.id,
                name: c.name,
                courseName: c.course?.name,
                studentCount,
                progress,
                status: c.status
            };
        }));

        // 6. Hoạt động gần đây (Recent Activities)
        // Lấy 5 bài nộp muộn nhất hoặc mới nộp
        const recentSubmissions = await Submission.findAll({
            include: [
                {
                    model: Assessment, as: "assessment",
                    where: { class_id: { [Op.in]: classIds } },
                    attributes: ["id", "title", "due_at", "class_id", "type"]
                },
                {
                    model: User,
                    as: "student",
                    attributes: ["full_name"]
                }
            ],
            order: [["submitted_at", "DESC"]],
            limit: 5
        });

        const recentActivities = recentSubmissions.map(sub => {
            const isLate = (sub.assessment?.due_at && new Date(sub.submitted_at) > new Date(sub.assessment?.due_at));
            return {
                id: sub.id,
                type: 'SUBMISSION',
                studentName: sub.student?.full_name,
                assessmentTitle: sub.assessment?.title,
                timestamp: sub.submitted_at,
                isLate: isLate,
                message: `${sub.student?.full_name} đã nộp bài "${sub.assessment?.title || "không rõ"}"` + (isLate ? " (Muộn)" : ""),
                link: sub.assessment?.type?.toUpperCase() === 'QUIZ' 
                    ? `/teacher/classes/${sub.assessment?.class_id}/assessments/${sub.assessment?.id}/quiz-attempts` 
                    : `/teacher/classes/${sub.assessment?.class_id}/assessments/${sub.assessment?.id}/submissions`
            };
        });

        return {
            todaySessions: todaySessions.map(s => ({
                id: s.id,
                className: s.class?.name,
                startTime: s.start_time,
                endTime: s.end_time,
                room: s.room
            })),
            needsGrading: needsGradingList,
            classes: classDetails,
            recentActivities
        };
    }
        ,
        getGradingOverview: async (teacherId) => {

            const classes = await Class.findAll({
                where: { teacher_id: teacherId }
            });
            const classIds = classes.map(c => c.id);

            const assessments = await Assessment.findAll({
                where: { class_id: { [Op.in]: classIds } },
                include: [
                    { 
                        model: Class, 
                        as: "class", 
                        attributes: ["name"],
                        include: [{ model: Course, as: "course", attributes: ["name"] }]
                    },
                    {
                        model: Submission,
                        as: "submissions",
                        include: [{ model: Grade, as: "grade" }]
                    }
                ],
                order: [["created_at", "DESC"]]
            });

            return assessments.map(a => {
                let needsGradingCount = 0;
                let gradedCount = 0;

                if (a.submissions) {
                    a.submissions.forEach(sub => {
                        if (sub.grade) {
                            gradedCount++;
                        } else {
                            needsGradingCount++;
                        }
                    });
                }
                return {
                    id: a.id,
                    title: a.title,
                    type: a.type, // QUIZ hoặc ASSIGNMENT
                    className: a.class?.course?.name ? `${a.class.course.name} (${a.class.name})` : a.class?.name,
                    classId: a.class_id,
                    dueAt: a.due_at,
                    needsGradingCount,
                    gradedCount
                };
            });
        },


    // ================================================================
    // UC_TEA_13: Duyệt điểm Quiz (Quiz Review)
    // ================================================================

    /**
     * Bước 1-2: Lấy danh sách tất cả lượt làm bài (Attempts) của một Quiz
     * + Biểu đồ phổ điểm (Score Distribution)
     */
    getQuizAttempts: async (teacherId, assessmentId) => {
        // 1. Kiểm tra quiz tồn tại và thuộc quyền giáo viên
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [{
                model: Class,
                as: 'class'
            }]
        });

        if (!assessment || assessment.type !== 'QUIZ') {
            throw new NotFoundError("Không tìm thấy bài Quiz.");
        }

        if (String(assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        // 2. Lấy tất cả submissions kèm thông tin sinh viên + điểm
        const allSubmissions = await Submission.findAll({
            where: { assessment_id: assessmentId },
            include: [
                {
                    model: User,
                    as: 'student',
                    attributes: ['id', 'full_name', 'email', 'avatar_url']
                },
                {
                    model: Grade,
                    as: 'grade',
                    attributes: ['final_score', 'is_published', 'graded_at']
                }
            ],
            order: [['submitted_at', 'DESC']]
        });

        // 3. Phân nhóm theo sinh viên và áp dụng gradeMethod
        const settings = parseQuizSettings(assessment.instructions, assessment.settings_json);
        const gradeMethod = settings.gradeMethod || "highest";

        const parseMeta = (txt) => {
            if (!txt) return {};
            try { return JSON.parse(txt); } catch { return {}; }
        };

        const studentMap = new Map();
        for (const sub of allSubmissions) {
            const sid = String(sub.student_id);
            if (!studentMap.has(sid)) studentMap.set(sid, []);
            studentMap.get(sid).push(sub);
        }

        const selectedSubmissions = [];
        for (const [sid, subs] of studentMap.entries()) {
            const finishedSubs = subs.filter(s => ['submitted', 'graded'].includes(s.status));
            
            if (finishedSubs.length === 0) {
                const subJson = subs[0].toJSON();
                subJson.attempt_count = subs.length;
                const meta = parseMeta(subJson.content_text);
                subJson.is_cheat = !!meta.isCheat;
                selectedSubmissions.push(subJson); // Lấy bản ghi mới nhất (thường là in_progress)
                continue;
            }

            if (gradeMethod === "highest") {
                finishedSubs.sort((a, b) => {
                    const scoreA = a.grade?.final_score != null ? parseFloat(a.grade.final_score) : -1;
                    const scoreB = b.grade?.final_score != null ? parseFloat(b.grade.final_score) : -1;
                    if (scoreB !== scoreA) return scoreB - scoreA;
                    return new Date(b.submitted_at) - new Date(a.submitted_at);
                });
                const subJson = finishedSubs[0].toJSON();
                subJson.attempt_count = subs.length;
                const meta = parseMeta(subJson.content_text);
                subJson.is_cheat = !!meta.isCheat;
                selectedSubmissions.push(subJson);
            } else if (gradeMethod === "last") {
                finishedSubs.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
                const subJson = finishedSubs[0].toJSON();
                subJson.attempt_count = subs.length;
                const meta = parseMeta(subJson.content_text);
                subJson.is_cheat = !!meta.isCheat;
                selectedSubmissions.push(subJson);
            } else if (gradeMethod === "average") {
                const totalScore = finishedSubs.reduce((sum, s) => sum + (s.grade?.final_score != null ? parseFloat(s.grade.final_score) : 0), 0);
                const avgScore = totalScore / finishedSubs.length;
                
                const latest = [...finishedSubs].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0];
                const subJson = latest.toJSON();
                if (subJson.grade) {
                    subJson.grade.final_score = Math.round(avgScore * 100) / 100;
                } else {
                    subJson.grade = { final_score: Math.round(avgScore * 100) / 100 };
                }
                subJson.is_average = true;
                subJson.attempt_count = subs.length;
                const meta = parseMeta(subJson.content_text);
                subJson.is_cheat = !!meta.isCheat;
                selectedSubmissions.push(subJson);
            } else {
                const subJson = finishedSubs[0].toJSON();
                subJson.attempt_count = subs.length;
                const meta = parseMeta(subJson.content_text);
                subJson.is_cheat = !!meta.isCheat;
                selectedSubmissions.push(subJson);
            }
        }

        // 4. Tính phổ điểm (Score Distribution) theo % của max_score
        const maxScore = parseFloat(assessment.max_score) || 100;
        const buckets = [
            { label: '0-10%', min: 0, max: maxScore * 0.1, count: 0 },
            { label: '10-20%', min: maxScore * 0.1, max: maxScore * 0.2, count: 0 },
            { label: '20-30%', min: maxScore * 0.2, max: maxScore * 0.3, count: 0 },
            { label: '30-40%', min: maxScore * 0.3, max: maxScore * 0.4, count: 0 },
            { label: '40-50%', min: maxScore * 0.4, max: maxScore * 0.5, count: 0 },
            { label: '50-60%', min: maxScore * 0.5, max: maxScore * 0.6, count: 0 },
            { label: '60-70%', min: maxScore * 0.6, max: maxScore * 0.7, count: 0 },
            { label: '70-80%', min: maxScore * 0.7, max: maxScore * 0.8, count: 0 },
            { label: '80-90%', min: maxScore * 0.8, max: maxScore * 0.9, count: 0 },
            { label: '90-100%', min: maxScore * 0.9, max: maxScore * 1.0 + 0.01, count: 0 },
        ];

        let totalScore = 0;
        let gradedCount = 0;

        const processedSubmissions = selectedSubmissions.map(sub => {
            const subJson = (typeof sub.toJSON === 'function') ? sub.toJSON() : sub;
            const score = subJson.grade?.final_score != null
                ? parseFloat(subJson.grade.final_score)
                : null;

            // Tính thời gian làm bài
            let durationMinutes = null;
            if (subJson.started_at && subJson.submitted_at) {
                durationMinutes = Math.round(
                    (new Date(subJson.submitted_at) - new Date(subJson.started_at)) / 60000
                );
            }

            // Phân bổ vào bucket phổ điểm
            if (score != null) {
                totalScore += score;
                gradedCount++;
                for (const bucket of buckets) {
                    if (score >= bucket.min && score < bucket.max) {
                        bucket.count++;
                        break;
                    }
                }
            }

            return {
                ...subJson,
                total_score: score,
                duration_minutes: durationMinutes
            };
        });

        const averageScore = gradedCount > 0 ? Math.round((totalScore / gradedCount) * 100) / 100 : null;

        return {
            quiz: {
                id: assessment.id,
                title: assessment.title,
                max_score: maxScore,
                time_limit_minutes: assessment.time_limit_minutes,
                attempt_limit: assessment.attempt_limit,
                status: assessment.status
            },
            summary: {
                total_attempts: allSubmissions.length,
                unique_students: studentMap.size,
                graded_count: gradedCount,
                average_score: averageScore
            },
            score_distribution: buckets,
            attempts: processedSubmissions,
            grade_method: gradeMethod
        };
    },

    /**
     * Bước 3-4: Xem chi tiết lượt làm bài (Review Attempt)
     * Hiển thị từng câu hỏi, đáp án SV đã chọn, đáp án đúng, điểm
     */
    getQuizAttemptDetail: async (teacherId, submissionId) => {
        const submission = await Submission.findByPk(submissionId, {
            include: [
                {
                    model: User,
                    as: 'student',
                    attributes: ['id', 'full_name', 'email', 'avatar_url']
                },
                {
                    model: Assessment,
                    as: 'assessment',
                    include: [{
                        model: Class,
                        as: 'class'
                    }]
                },
                {
                    model: Grade,
                    as: 'grade'
                },
                {
                    model: SubmissionAnswer,
                    as: 'answers',
                    include: [
                        {
                            model: QuizQuestion,
                            as: 'question',
                            include: [{
                                model: QuizOption,
                                as: 'options',
                                attributes: ['id', 'option_text', 'is_correct', 'display_order'],
                                order: [['display_order', 'ASC']]
                            }]
                        },
                        {
                            model: QuizOption,
                            as: 'selectedOption',
                            attributes: ['id', 'option_text', 'is_correct']
                        }
                    ]
                }
            ]
        });

        if (!submission) {
            throw new NotFoundError("Không tìm thấy lượt làm bài.");
        }

        if (submission.assessment.type !== 'QUIZ') {
            throw new AppError("Bài này không phải là Quiz.", 400);
        }

        if (String(submission.assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        // Tính thời gian làm bài
        let durationMinutes = null;
        if (submission.started_at && submission.submitted_at) {
            durationMinutes = Math.round(
                (new Date(submission.submitted_at) - new Date(submission.started_at)) / 60000
            );
        }

        // Sắp xếp câu hỏi theo display_order
        const sortedAnswers = submission.answers
            .map(a => a.toJSON())
            .sort((a, b) => (a.question?.display_order || 0) - (b.question?.display_order || 0));

        // Format từng câu hỏi
        const questions = sortedAnswers.map(answer => ({
            question_id: answer.question_id,
            question_text: answer.question?.question_text,
            display_order: answer.question?.display_order,
            max_points: answer.question ? parseFloat(answer.question.points) : null,
            options: answer.question?.options?.map(opt => ({
                id: opt.id,
                option_text: opt.option_text,
                is_correct: opt.is_correct,
                is_selected: opt.id === answer.selected_option_id
            })) || [],
            selected_option_id: answer.selected_option_id,
            selected_option_text: answer.selectedOption?.option_text || null,
            is_correct: answer.is_correct,
            score: answer.score != null ? parseFloat(answer.score) : null,
            answer_id: answer.id
        }));

        return {
            submission: {
                id: submission.id,
                attempt_no: submission.attempt_no,
                status: submission.status,
                started_at: submission.started_at,
                submitted_at: submission.submitted_at,
                duration_minutes: durationMinutes
            },
            student: submission.student,
            quiz: {
                id: submission.assessment.id,
                title: submission.assessment.title,
                max_score: parseFloat(submission.assessment.max_score),
                time_limit_minutes: submission.assessment.time_limit_minutes
            },
            grade: submission.grade ? {
                final_score: parseFloat(submission.grade.final_score),
                is_published: submission.grade.is_published,
                graded_at: submission.grade.graded_at
            } : null,
            questions
        };
    },

    /**
     * Bước 5-8: Ghi đè điểm một câu hỏi cụ thể (Override Mark)
     * Cập nhật điểm câu hỏi -> Tính lại tổng -> Cập nhật Grade
     */
    overrideQuestionScore: async (teacherId, submissionId, questionId, payload) => {
        const { new_score, reason } = payload;

        return await sequelize.transaction(async (t) => {
            // 1. Lấy submission + kiểm tra quyền
            const submission = await Submission.findByPk(submissionId, {
                include: [
                    {
                        model: Assessment,
                        as: 'assessment',
                        include: [{ model: Class, as: 'class' }]
                    }
                ],
                transaction: t
            });

            if (!submission) {
                throw new NotFoundError("Không tìm thấy lượt làm bài.");
            }

            if (String(submission.assessment.class.teacher_id) !== String(teacherId)) {
                throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
            }

            // 2. Tìm câu trả lời
            const answer = await SubmissionAnswer.findOne({
                where: {
                    submission_id: submissionId,
                    question_id: questionId
                },
                transaction: t
            });

            if (!answer) {
                throw new NotFoundError("Không tìm thấy câu trả lời của sinh viên cho câu hỏi này.");
            }

            // 3. Kiểm tra điểm không vượt quá max points
            const question = await QuizQuestion.findByPk(questionId, { transaction: t });
            if (question && new_score > parseFloat(question.points)) {
                throw new ValidationError(
                    `Điểm mới (${new_score}) không được vượt quá điểm tối đa của câu hỏi (${question.points}).`
                );
            }

            // 4. Cập nhật điểm câu hỏi
            const oldScore = answer.score;
            await answer.update({
                score: new_score,
                is_correct: new_score > 0
            }, { transaction: t });

            // 5. Tính lại tổng điểm cho toàn bộ submission
            const allAnswers = await SubmissionAnswer.findAll({
                where: { submission_id: submissionId },
                transaction: t
            });

            const newTotalScore = allAnswers.reduce((sum, a) => {
                return sum + (parseFloat(a.score) || 0);
            }, 0);

            // 6. Cập nhật hoặc tạo Grade
            let grade = await Grade.findOne({
                where: { submission_id: submissionId },
                transaction: t
            });

            if (grade) {
                await grade.update({
                    final_score: newTotalScore,
                    final_feedback: `[Ghi đè điểm câu ${question?.display_order || '?'}] Lý do: ${reason}. Điểm cũ: ${oldScore} → Điểm mới: ${new_score}`,
                    graded_by: teacherId,
                    graded_at: new Date(),
                    status: 'graded'
                }, { transaction: t });
            } else {
                grade = await Grade.create({
                    submission_id: submissionId,
                    final_score: newTotalScore,
                    final_feedback: `[Ghi đè điểm câu ${question?.display_order || '?'}] Lý do: ${reason}. Điểm mới: ${new_score}`,
                    graded_by: teacherId,
                    graded_at: new Date(),
                    status: 'graded'
                }, { transaction: t });
            }

            return {
                question_id: questionId,
                old_score: oldScore,
                new_score: new_score,
                reason: reason,
                new_total_score: newTotalScore,
                grade_id: grade.id
            };
        });
    },

    /**
     * Xóa một lượt làm bài (Delete Attempt)
     */
    deleteQuizAttempt: async (teacherId, submissionId) => {
        return await sequelize.transaction(async (t) => {
            const submission = await Submission.findByPk(submissionId, {
                include: [
                    {
                        model: Assessment,
                        as: 'assessment',
                        include: [{ model: Class, as: 'class' }]
                    }
                ],
                transaction: t
            });

            if (!submission) {
                throw new NotFoundError("Không tìm thấy lượt làm bài.");
            }

            if (submission.assessment.type !== 'QUIZ') {
                throw new AppError("Bài này không phải là Quiz.", 400);
            }

            if (String(submission.assessment.class.teacher_id) !== String(teacherId)) {
                throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
            }

            // Xóa Grade, SubmissionAnswer, rồi Submission
            await Grade.destroy({ where: { submission_id: submissionId }, transaction: t });
            await SubmissionAnswer.destroy({ where: { submission_id: submissionId }, transaction: t });
            await submission.destroy({ transaction: t });

            return {
                message: "Đã xóa lượt làm bài thành công.",
                deleted_submission_id: submissionId
            };
        });
    },

    /**
     * A1: Chấm lại toàn bộ (Regrade All)
     * Quét lại tất cả bài làm và tính điểm theo đáp án đúng hiện tại
     */
    regradeAllAttempts: async (teacherId, assessmentId) => {
        // 1. Kiểm tra quiz + quyền
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [{ model: Class, as: 'class' }]
        });

        if (!assessment || assessment.type !== 'QUIZ') {
            throw new NotFoundError("Không tìm thấy bài Quiz.");
        }

        if (String(assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        return await sequelize.transaction(async (t) => {
            // 2. Lấy tất cả câu hỏi + đáp án đúng hiện tại
            const questions = await QuizQuestion.findAll({
                where: { assessment_id: assessmentId },
                include: [{
                    model: QuizOption,
                    as: 'options'
                }],
                transaction: t
            });

            // Tạo map: question_id -> { points, correctOptionIds }
            const questionMap = {};
            for (const q of questions) {
                questionMap[q.id] = {
                    points: parseFloat(q.points),
                    correctOptionIds: q.options
                        .filter(o => o.is_correct)
                        .map(o => o.id)
                };
            }

            // 3. Lấy tất cả submissions
            const submissions = await Submission.findAll({
                where: { assessment_id: assessmentId },
                include: [{
                    model: SubmissionAnswer,
                    as: 'answers'
                }],
                transaction: t
            });

            let regradedCount = 0;

            // 4. Duyệt từng submission, chấm lại từng câu
            for (const submission of submissions) {
                let newTotalScore = 0;

                for (const answer of submission.answers) {
                    const qInfo = questionMap[answer.question_id];
                    if (!qInfo) continue;

                    const isCorrect = qInfo.correctOptionIds.includes(answer.selected_option_id);
                    const score = isCorrect ? qInfo.points : 0;

                    await answer.update({
                        is_correct: isCorrect,
                        score: score
                    }, { transaction: t });

                    newTotalScore += score;
                }

                // 5. Cập nhật Grade
                let grade = await Grade.findOne({
                    where: { submission_id: submission.id },
                    transaction: t
                });

                if (grade) {
                    await grade.update({
                        final_score: newTotalScore,
                        final_feedback: `[Regrade All] Chấm lại toàn bộ lúc ${new Date().toISOString()}`,
                        graded_by: teacherId,
                        graded_at: new Date(),
                        status: 'graded'
                    }, { transaction: t });
                } else {
                    await Grade.create({
                        submission_id: submission.id,
                        final_score: newTotalScore,
                        final_feedback: `[Regrade All] Chấm lại toàn bộ lúc ${new Date().toISOString()}`,
                        graded_by: teacherId,
                        graded_at: new Date(),
                        status: 'graded'
                    }, { transaction: t });
                }

                regradedCount++;
            }

            return {
                message: `Đã chấm lại thành công ${regradedCount} lượt làm bài.`,
                regraded_count: regradedCount,
                assessment_id: assessmentId
            };
        });
    },

    // ================================================================
    // UC_TEA_09: Soạn câu hỏi Quiz (Quiz Question CRUD)
    // ================================================================

    /**
     * Lấy danh sách câu hỏi của Quiz (kèm options)
     */
    getQuizQuestions: async (teacherId, assessmentId) => {
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [{ model: Class, as: 'class' }]
        });

        if (!assessment || assessment.type !== 'QUIZ') {
            throw new NotFoundError("Không tìm thấy bài Quiz.");
        }

        if (String(assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        const questions = await QuizQuestion.findAll({
            where: { assessment_id: assessmentId },
            include: [{
                model: QuizOption,
                as: 'options',
                attributes: ['id', 'option_text', 'is_correct', 'display_order']
            }],
            order: [
                ['display_order', 'ASC'],
                [{ model: QuizOption, as: 'options' }, 'display_order', 'ASC']
            ]
        });

        return {
            quiz: {
                id: assessment.id,
                title: assessment.title,
                status: assessment.status
            },
            questions,
            total_questions: questions.length
        };
    },

    /**
     * Alternative Flow 3a-3f: Thêm 1 câu hỏi thủ công
     */
    addQuizQuestion: async (teacherId, assessmentId, payload) => {
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [{ model: Class, as: 'class' }]
        });

        if (!assessment || assessment.type !== 'QUIZ') {
            throw new NotFoundError("Không tìm thấy bài Quiz.");
        }

        if (String(assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        return await sequelize.transaction(async (t) => {
            // Tính display_order tự động nếu không truyền
            let displayOrder = payload.display_order;
            if (!displayOrder) {
                const maxOrder = await QuizQuestion.max('display_order', {
                    where: { assessment_id: assessmentId },
                    transaction: t
                });
                displayOrder = (maxOrder || 0) + 1;
            }

            // Tạo câu hỏi
            const question = await QuizQuestion.create({
                assessment_id: assessmentId,
                question_text: payload.question_text,
                points: payload.points,
                display_order: displayOrder
            }, { transaction: t });

            // Tạo options
            const options = await QuizOption.bulkCreate(
                payload.options.map(opt => ({
                    question_id: question.id,
                    option_text: opt.option_text,
                    is_correct: opt.is_correct,
                    display_order: opt.display_order
                })),
                { transaction: t }
            );

            return {
                question: {
                    ...question.toJSON(),
                    options
                }
            };
        });
    },

    /**
     * Cập nhật câu hỏi (nội dung + options)
     */
    updateQuizQuestion: async (teacherId, questionId, payload) => {
        const question = await QuizQuestion.findByPk(questionId, {
            include: [{
                model: Assessment,
                as: 'assessment',
                include: [{ model: Class, as: 'class' }]
            }]
        });

        if (!question) {
            throw new NotFoundError("Không tìm thấy câu hỏi.");
        }

        if (question.assessment.type !== 'QUIZ') {
            throw new AppError("Bài này không phải Quiz.", 400);
        }

        if (String(question.assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        return await sequelize.transaction(async (t) => {
            // Cập nhật câu hỏi
            const updateData = {};
            if (payload.question_text !== undefined) updateData.question_text = payload.question_text;
            if (payload.points !== undefined) updateData.points = payload.points;
            if (payload.display_order !== undefined) updateData.display_order = payload.display_order;

            if (Object.keys(updateData).length > 0) {
                await question.update(updateData, { transaction: t });
            }

            // Nếu có options -> xóa cũ, tạo mới
            if (payload.options && payload.options.length > 0) {
                await QuizOption.destroy({
                    where: { question_id: questionId },
                    transaction: t
                });

                await QuizOption.bulkCreate(
                    payload.options.map(opt => ({
                        question_id: questionId,
                        option_text: opt.option_text,
                        is_correct: opt.is_correct,
                        display_order: opt.display_order
                    })),
                    { transaction: t }
                );
            }

            // Reload để trả về dữ liệu mới
            const updated = await QuizQuestion.findByPk(questionId, {
                include: [{
                    model: QuizOption,
                    as: 'options',
                    attributes: ['id', 'option_text', 'is_correct', 'display_order']
                }],
                order: [[{ model: QuizOption, as: 'options' }, 'display_order', 'ASC']],
                transaction: t
            });

            return updated;
        });
    },

    /**
     * Xóa câu hỏi (kèm options)
     */
    deleteQuizQuestion: async (teacherId, questionId) => {
        const question = await QuizQuestion.findByPk(questionId, {
            include: [{
                model: Assessment,
                as: 'assessment',
                include: [{ model: Class, as: 'class' }]
            }]
        });

        if (!question) {
            throw new NotFoundError("Không tìm thấy câu hỏi.");
        }

        if (String(question.assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        return await sequelize.transaction(async (t) => {
            await QuizOption.destroy({ where: { question_id: questionId }, transaction: t });
            await question.destroy({ transaction: t });

            return {
                message: "Đã xóa câu hỏi thành công.",
                deleted_question_id: questionId
            };
        });
    },

    /**
     * Normal Flow bước 8: Thêm nhiều câu hỏi cùng lúc (Bulk create)
     * Dùng cho cả "Lưu vào đề" từ AI và nhập thủ công hàng loạt
     */
    bulkAddQuizQuestions: async (teacherId, assessmentId, questions) => {
        const assessment = await Assessment.findByPk(assessmentId, {
            include: [{ model: Class, as: 'class' }]
        });

        if (!assessment || assessment.type !== 'QUIZ') {
            throw new NotFoundError("Không tìm thấy bài Quiz.");
        }

        if (String(assessment.class.teacher_id) !== String(teacherId)) {
            throw new AppError("Forbidden: Bạn không quản lý lớp này.", 403);
        }

        return await sequelize.transaction(async (t) => {
            // Lấy display_order hiện tại cao nhất
            const maxOrder = await QuizQuestion.max('display_order', {
                where: { assessment_id: assessmentId },
                transaction: t
            }) || 0;

            const createdQuestions = [];

            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const displayOrder = q.display_order || (maxOrder + i + 1);

                const question = await QuizQuestion.create({
                    assessment_id: assessmentId,
                    question_text: q.question_text,
                    points: q.points,
                    display_order: displayOrder
                }, { transaction: t });

                const options = await QuizOption.bulkCreate(
                    q.options.map(opt => ({
                        question_id: question.id,
                        option_text: opt.option_text,
                        is_correct: opt.is_correct,
                        display_order: opt.display_order
                    })),
                    { transaction: t }
                );

                createdQuestions.push({
                    ...question.toJSON(),
                    options
                });
            }

            return {
                message: `Đã thêm ${createdQuestions.length} câu hỏi vào đề.`,
                created_count: createdQuestions.length,
                questions: createdQuestions
            };
        });
    },


/**
 * UC_TEA_09 Normal Flow Bước 3-6: Sinh câu hỏi từ AI
 * - Kết hợp Prompt và Tài liệu (file_urls)
 * - AI trả về JSON danh sách đề xuất
 */
generateAiQuizQuestions: async (teacherId, assessmentId, payload) => {
    const assessment = await Assessment.findByPk(assessmentId, {
        include: [{ model: AssessmentFile, as: 'files' }, { model: Class, as: 'class' }]
    });

    if (!assessment) throw new NotFoundError("Bài Quiz không tồn tại.");
    if (String(assessment.class.teacher_id) !== String(teacherId)) {
        throw new AppError("Forbidden", 403);
    }

    // 1. Khởi tạo Gemini AI
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite", // Dùng bản 2.5 (mã hóa theo system info) hoặc gemini-1.5-flash
        generationConfig: { responseMimeType: "application/json" }
    });

    let requestData = [];

    requestData.push(`Bạn là một trợ lý giáo viên chuyên soạn đề kiểm tra. 
Nhiệm vụ: Dựa trên tài liệu và yêu cầu dưới đây, hãy tạo bộ câu hỏi trắc nghiệm (Multiple Choice).

YÊU CẦU:
- Số lượng: ${payload.num_questions || 10} câu.
- Prompt từ giáo viên: "${payload.prompt}"
- Môn học/Tiêu đề: "${assessment.title}"

ĐỊNH DẠNG TRẢ VỀ (JSON):
Trả về danh sách các object câu hỏi theo format sau:
[
  {
    "question_text": "<Nội dung câu hỏi>",
    "points": <Số điểm gợi ý cho câu này, VD: 1>,
    "options": [
      { "option_text": "<Lựa chọn A>", "is_correct": <true/false>, "display_order": 1 },
      { "option_text": "<Lựa chọn B>", "is_correct": <true/false>, "display_order": 2 },
      ...
    ]
  }
]
CHÚ Ý: Một câu hỏi có thể có 1 hoặc nhiều đáp án đúng (is_correct: true). Đảm bảo tính chính xác kiến thức.`);

    // 2. Xử lý file đính kèm (nếu có)
    const combinedFiles = [
        ...(assessment.files || []).map(f => ({ url: f.file_url, name: f.original_name })),
        ...(payload.file_urls || []).map(url => ({ url, name: url.split('/').pop() }))
    ];

    if (combinedFiles.length > 0) {
        requestData.push("\n========== TÀI LIỆU THAM KHẢO ==========");
        for (const file of combinedFiles) {
            try {
                const response = await fetch(file.url);
                const buffer = Buffer.from(await response.arrayBuffer());
                const fileName = file.name.toLowerCase();

                if (fileName.endsWith('.docx')) {
                    const result = await mammoth.extractRawText({ buffer });
                    requestData.push(`\n[Nội dung từ ${file.name}]:\n${result.value}\n`);
                } else if (fileName.endsWith('.pdf') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
                    const mimeType = fileName.endsWith('.pdf') ? "application/pdf" : (fileName.endsWith('.png') ? "image/png" : "image/jpeg");
                    requestData.push({
                        inlineData: { data: buffer.toString("base64"), mimeType }
                    });
                }
            } catch (e) {
                console.error(`Lỗi đọc file ${file.name}:`, e);
            }
        }
    }

    // 3. Gửi cho AI
    try {
        const result = await model.generateContent(requestData);
        const responseText = result.response.text();
        const questions = JSON.parse(responseText);

        // Gắn display_order cho câu hỏi
        return questions.map((q, idx) => ({
            ...q,
            display_order: idx + 1
        }));
    } catch (error) {
        console.error("Lỗi Gemini AI:", error);
        throw new AppError("AI không phản hồi hoặc tài liệu không thể đọc được. (E2)", 500);
    }
}
};