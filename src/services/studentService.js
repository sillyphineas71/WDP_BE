// src/services/studentService.js
import { Class } from "../models/Class.js";
import { Enrollment } from "../models/Enrollment.js";
import { User } from "../models/User.js";
import { ClassSession } from "../models/ClassSession.js";
import { Assessment } from "../models/Assessment.js";
import { Material } from "../models/Material.js";
import { Notification } from "../models/Notification.js";
import { Op } from "sequelize";
import { Submission } from "../models/Submission.js";
import { AssessmentFile } from "../models/AssessmentFile.js";
import { ConflictError, NotFoundError } from "../errors/AppError.js";
import sequelize from "../config/database.js";
import { Grade } from "../models/Grade.js"; 
import { SubmissionFile } from "../models/SubmissionFile.js"; 

export const studentService = {
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
          ],
        },
      ],
    });

    const enrolledClassIds = enrollments.map((e) => e.class_id);
    
    if (enrolledClassIds.length === 0) {
      return {
        classes: [],
        upcomingAssessments: 0,
        todaySessions: [],
        recentGrades: []
      };
    }

    // 2. Count upcoming assessments
    const upcomingAssessments = await Assessment.count({
      where: {
        class_id: { [Op.in]: enrolledClassIds },
        status: "published",
        due_at: { [Op.gte]: new Date() },
      },
    });

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
      include: [
        {
          model: Class,
          as: "class", 
          attributes: ["id", "name"],
        },
      ],
      order: [["start_time", "ASC"]],
    });

    const formattedSessions = todaySessions.map(session => ({
        id: session.id,
        title: session.class.name,
        date: session.start_time.toLocaleDateString('vi-VN'),
        time: `${session.start_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit'})} - ${session.end_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit'})}`,
        location: `Room ${session.room || 'TBA'}`
    }));

    const formattedClasses = enrollments.map(e => ({
        id: e.class.id,
        name: e.class.name,
        teacher: e.class.teacher ? e.class.teacher.full_name : "N/A",
        room: e.class.room || "TBA"
    }));

    return {
      classes: formattedClasses,
      upcomingAssessments,
      todaySessions: formattedSessions,
      recentGrades: [] 
    };
  },

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
        
        const schedule = (c.sessions || []).map(s => {
            const dayOptions = { weekday: 'short' };
            const timeOptions = { hour: '2-digit', minute: '2-digit' };
            return {
                day: s.start_time.toLocaleDateString('en-US', dayOptions),
                time: `${s.start_time.toLocaleTimeString('en-US', timeOptions)} - ${s.end_time.toLocaleTimeString('en-US', timeOptions)}`,
                room: s.room || c.room
            };
        });

        return {
            id: c.id,
            name: c.name,
            teacher: c.teacher ? c.teacher.full_name : "N/A",
            room: c.room || "TBA",
            schedule: schedule
        };
    });
  },

  getClassDetails: async (studentId, classId) => {
    const enrollment = await Enrollment.findOne({
      where: { user_id: studentId, class_id: classId },
    });

    if (!enrollment) throw new Error("You are not enrolled in this class");

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
           attributes: ["start_time", "end_time"],
           order: [["start_time", "ASC"]]
        }
      ],
    });

    if (!cl) throw new Error("Class not found");

    const studentsCount = await Enrollment.count({ where: { class_id: classId }});

    const materials = await Material.findAll({
      where: { class_id: classId },
      order: [["created_at", "DESC"]],
    });

    const assignments = await Assessment.findAll({
      where: { class_id: classId, status: { [Op.ne]: 'draft' } },
      order: [["due_at", "ASC"]],
    });
    
    const announcements = []; 

    return {
      id: cl.id,
      name: cl.name,
      teacher: cl.teacher ? cl.teacher.full_name : "N/A",
      room: cl.room || "TBA",
      studentsCount,
      schedule: (cl.sessions || []).map(s => ({
          day: s.start_time.toLocaleDateString('en-US', { weekday: 'long' }),
          time: `${s.start_time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit'})} - ${s.end_time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit'})}`,
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
          due: a.due_at ? a.due_at.toLocaleString('en-US') : 'No due date',
          points: a.type === 'QUIZ' ? '100' : '100', 
      })),
      announcements: announcements.map(a => ({
          id: a.id,
          title: a.title,
          content: a.message,
          date: a.created_at.toLocaleString('en-US')
      }))
    };
  },

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
      attributes: ['id', 'assessment_id', 'student_id', 'status', 'submitted_at', 'content_text'],
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

  submitAssignment: async (studentId, assessmentId, data) => {
    const assessment = await Assessment.findByPk(assessmentId);
    if (!assessment) throw new Error("Không tìm thấy bài tập.");

    const now = new Date();
    
    // 1. Kiểm tra đóng cổng (Cutoff)
    if (assessment.cutoff_at && now > new Date(assessment.cutoff_at)) {
      throw new Error("Hệ thống đã đóng cổng nộp bài.");
    }

    // 2. TÍNH TOÁN TRẠNG THÁI NỘP BÀI (ĐÚNG HẠN HAY MUỘN)
    let finalStatus = 'submitted';
    if (assessment.due_at && now > new Date(assessment.due_at)) {
        finalStatus = 'submitted_late';
    }

    return await sequelize.transaction(async (t) => {
      let submission = await Submission.findOne({ 
        where: { assessment_id: assessmentId, student_id: studentId },
        transaction: t
      });

      // 3. Cập nhật trạng thái bằng finalStatus đã tính toán
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

      // 4. LƯU FILE VÀO BẢNG SubmissionFile
      if (data.files && Array.isArray(data.files) && data.files.length > 0) {
        const { SubmissionFile } = sequelize.models; 
        
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
            mimeType: mimeType 
          };
        });

        await SubmissionFile.bulkCreate(filesToSave, { transaction: t });
      }

      return submission;
    });
  }
};