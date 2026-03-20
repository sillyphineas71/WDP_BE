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

export const teacherService = {

    // ================================================================
    // Dev branch (nam-branch): Quiz / Assignment / Grades
    // ================================================================

    /**
     * GET classes that teacher manages (dev branch)
     */
    getClassesByTeacher: async (teacherId) => {
        const classes = await Class.findAll({
            where: { teacher_id: teacherId },
            include: [
                {
                    model: Course,
                    as: "course",
                    attributes: ["name"]
                }
            ],
            order: [["start_date", "DESC"]]
        });

        return classes.map(c => ({
            id: c.id,
            name: c.name,
            courseName: c.course?.name,
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
                    body: `Điểm bài "${assessment.title}" đã được giảng viên công bố. Vào trang điểm để xem kết quả.`,
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
        const cls = await Class.findOne({ where: { id: classId, teacher_id: teacherId } });
        if (!cls) {
            throw new NotFoundError("Lớp học không tồn tại hoặc bạn không quản lý lớp này.");
        }

        return await Assessment.findAll({
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
    },

    getMyClasses: async (teacherId) => {
        return await Class.findAll({
            where: { teacher_id: teacherId, status: 'active' },
            include: [{ model: Course, as: 'course', attributes: ['name', 'code'] }],
            order: [['created_at', 'DESC']]
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

        const submissions = await Submission.findAll({
            where: { assessment_id: assessmentId },
            include: [
                { model: User, as: 'student', attributes: ['id', 'full_name', 'email', 'avatar_url'] },
                { model: Grade, as: 'grade', attributes: ['final_score', 'is_published'] }
            ],
            order: [['submitted_at', 'DESC']]
        });

        const processedSubmissions = submissions.map(sub => {
            const subJson = sub.toJSON();
            if (
                subJson.status === 'submitted' &&
                assessment.due_at &&
                new Date(subJson.submitted_at) > new Date(assessment.due_at)
            ) {
                subJson.status = 'submitted_late';
            }
            return subJson;
        });

        return {
            assessment: assessment,
            submissions: processedSubmissions
        };
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
        return submission;
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

        requestData.push(`Bạn là một giảng viên đại học khách quan và công tâm đang chấm bài tập.
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

    ,
    /**
     * UC_TEA_16: Get Teacher Dashboard Data
     */
    getDashboard: async (teacherId) => {
        const Op = sequelize.Sequelize.Op;
        const now = new Date();
        const startOfToday = new Date(now.setHours(0, 0, 0, 0));
        const endOfToday = new Date(now.setHours(23, 59, 59, 999));

        // 1. Lọc Lớp học của giảng viên phụ trách
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
                    attributes: ["id", "title", "due_at"],
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
                    title: sub.assessment.title,
                    className: sub.assessment.class?.name,
                    dueAt: sub.assessment.due_at,
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
                    attributes: ["title", "due_at"]
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
            const isLate = sub.status === 'submitted_late' || (sub.assessment?.due_at && new Date(sub.submitted_at) > new Date(sub.assessment?.due_at));
            return {
                id: sub.id,
                type: 'SUBMISSION',
                studentName: sub.student?.full_name,
                assessmentTitle: sub.assessment?.title,
                timestamp: sub.submitted_at,
                isLate: isLate,
                message: `${sub.student?.full_name} đã nộp bài "${sub.assessment?.title || "không rõ"}"` + (isLate ? " (Muộn)" : "")
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
                { model: Class, as: "class", attributes: ["name"] },
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
undefined                id: a.id,
                title: a.title,
                type: a.type, // QUIZ hoặc ASSIGNMENT
                className: a.class?.name,
                dueAt: a.due_at,
                needsGradingCount,
                gradedCount
            };
        });
,
    // =========================================================undefined                message: `Đã thêm ${createdQuestions.length} câu hỏi vào đề.`,
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

        requestData.push(`Bạn là một trợ lý giảng viên chuyên soạn đề kiểm tra. 
Nhiệm vụ: Dựa trên tài liệu và yêu cầu dưới đây, hãy tạo bộ câu hỏi trắc nghiệm (Multiple Choice).

YÊU CẦU:
- Số lượng: ${payload.num_questions || 10} câu.
- Prompt từ giảng viên: "${payload.prompt}"
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