// src/services/teacherService.js
import { Class } from "../models/Class.js";
import { Assessment } from "../models/Assessment.js";
import { Course } from "../models/Course.js";
import { AssessmentFile } from "../models/AssessmentFile.js";
import { Submission } from "../models/Submission.js";
import { SubmissionFile } from "../models/SubmissionFile.js";
import { Grade } from "../models/Grade.js";
import { User } from "../models/User.js";
import { ConflictError, NotFoundError } from "../errors/AppError.js";
import sequelize from "../config/database.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import mammoth from "mammoth"; 

export const teacherService = {
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
    // 1. Lấy thông tin bài tập (Lấy thêm Course để hiển thị tên môn học)
const assessment = await Assessment.findByPk(assessmentId, {
    include: [
        { 
            model: Class, 
            as: 'class',
            // include: [{ model: Course, as: 'course' }] 
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

    // 2. Lấy danh sách bài nộp
    const submissions = await Submission.findAll({
        where: { assessment_id: assessmentId },
        include: [
            { model: User, as: 'student', attributes: ['id', 'full_name', 'email', 'avatar_url'] },
            { model: Grade, as: 'grade', attributes: ['final_score', 'is_published'] }
        ],
        order: [['submitted_at', 'DESC']]
    });

    // 3. Xử lý logic nộp muộn
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

    // 4. TRẢ VỀ CẢ THÔNG TIN BÀI TẬP VÀ DANH SÁCH BÀI NỘP
    return {
        assessment: assessment,
        submissions: processedSubmissions
    };
  },

  // ==========================================
  // CÁC HÀM CHẤM ĐIỂM 
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

  allowResubmit: async (submissionId) => {
    const submission = await Submission.findByPk(submissionId);
    if (!submission) throw new Error("Bài nộp không tồn tại.");
    
    await submission.update({ 
        status: 'pending',
        attempt_no: submission.attempt_no + 1 
    });
    return submission;
  },

  aiGradeSubmission: async (submissionId) => {
    // 1. Lấy thông tin bài nộp, bao gồm file sinh viên VÀ file đề bài của giáo viên
    const submission = await Submission.findByPk(submissionId, {
        include: [
            { 
                model: Assessment, 
                as: 'assessment', 
                attributes: ['title', 'instructions', 'max_score'],
                // BỔ SUNG: Lấy thêm file đề bài của giáo viên
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
        model: "gemini-2.5-flash-lite", // Dùng bản 1.5 flash hoặc 2.5 flash lite đều tốt
        generationConfig: { responseMimeType: "application/json" } 
    });

    // 3. Chuẩn bị mảng dữ liệu gửi cho Gemini (Hỗ trợ nhét chữ và file xen kẽ nhau)
    let requestData = [];

    // Lời nhắc hệ thống (Mở đầu)
    requestData.push(`Bạn là một giảng viên đại học khó tính nhưng công tâm đang chấm bài tập.
    - Tiêu đề bài tập: "${submission.assessment.title}"
    - Hướng dẫn cơ bản: "${submission.assessment.instructions || 'Không có yêu cầu thêm'}"
    - Thang điểm tối đa: ${submission.assessment.max_score}
    - Lời nhắn của sinh viên khi nộp: "${submission.content_text || 'Không có'}"\n`);

    // HÀM HỖ TRỢ XỬ LÝ FILE DÀNH CHUNG CHO CẢ GIÁO VIÊN & SINH VIÊN
    const processFile = async (fileObj, roleLabel) => {
        try {
            const fileName = fileObj.original_name.toLowerCase();
            const response = await fetch(fileObj.file_url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            // NẾU LÀ DOCX: Bóc tách text bằng mammoth
            if (fileName.endsWith('.docx')) {
                const result = await mammoth.extractRawText({ buffer: buffer });
                requestData.push(`\n--- [NỘI DUNG TEXT TỪ ${roleLabel}: ${fileObj.original_name}] ---\n${result.value}\n`);
            } 
            // NẾU LÀ PDF, PNG, JPG: Nhét trực tiếp vào dạng InlineData cho Gemini đọc
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
    Đánh giá mức độ hoàn thành đúng yêu cầu đề bài không, chỉ ra ưu điểm, nhược điểm hoặc lỗi sai cụ thể. 
    Đưa ra điểm số cuối cùng (có thể là số thập phân, VD: 8.5) KHÔNG ĐƯỢC VƯỢT QUÁ ${submission.assessment.max_score} điểm.
    
    BẮT BUỘC trả về kết quả dưới dạng JSON có đúng 2 trường sau:
    {
      "suggested_score": <số điểm>,
      "feedback": "<nhận xét chi tiết>"
    }`);

    // 7. GỬI REQUEST CHO GEMINI VÀ TRẢ KẾT QUẢ VỀ FRONTEND
    try {
        const result = await model.generateContent(requestData);
        const responseText = result.response.text();
        return JSON.parse(responseText);
    } catch (error) {
        console.error("Lỗi khi gọi AI:", error);
        throw new Error("AI không phản hồi hoặc phản hồi sai định dạng JSON.");
    }
  }

};