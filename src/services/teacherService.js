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
    const assessment = await Assessment.findByPk(assessmentId, {
        include: [{ model: Class, as: 'class' }]
    });
    if (!assessment || assessment.class.teacher_id !== teacherId) {
        throw new NotFoundError("Không tìm thấy bài tập.");
    }

    return await Submission.findAll({
        where: { assessment_id: assessmentId },
        include: [
            { 
                model: User, 
                as: 'student', 
                attributes: ['id', 'full_name', 'email', 'avatar_url'] 
            },
            // THÊM ĐOẠN NÀY ĐỂ BACKEND GỬI KÈM ĐIỂM SỐ
            {
                model: Grade,
                as: 'grade',
                attributes: ['final_score', 'is_published']
            }
        ],
        order: [['submitted_at', 'DESC']]
    });
  },

  // ==========================================
  // CÁC HÀM CHẤM ĐIỂM (Đã được tách ra độc lập)
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
                // ĐÃ FIX: Xóa chữ 'files' ra khỏi mảng attributes
                attributes: ['id', 'title', 'max_score'], 
                // THÊM VÀO ĐÂY: Dùng include để lấy file đề bài từ bảng AssessmentFile
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
  }
};