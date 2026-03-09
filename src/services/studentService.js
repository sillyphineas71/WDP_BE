import { Class } from "../models/Class.js";
import { Enrollment } from "../models/Enrollment.js";
import { User } from "../models/User.js";
import { ClassSession } from "../models/ClassSession.js";
import { Assessment } from "../models/Assessment.js";
import { Material } from "../models/Material.js";
import { Notification } from "../models/Notification.js";
import { Op } from "sequelize";

export const studentService = {
  getDashboard: async (studentId) => {
    // 1. Get enrolled classes
    const enrollments = await Enrollment.findAll({
      where: { user_id: studentId },
      include: [
        {
          model: Class,
          as: "classInfo",
          include: [
            {
              model: User,
              as: "teacherInfo",
              attributes: ["id", "display_name"],
            },
          ],
        },
      ],
    });

    const enrolledClassIds = enrollments.map((e) => e.class_id);
    
    // Check if enrolled in any class
    if (enrolledClassIds.length === 0) {
      return {
        classes: [],
        upcomingAssessments: 0,
        todaySessions: [],
        recentGrades: []
      };
    }

    // 2. Count upcoming assessments (Assignments & Quizzes)
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
          as: "classInfo",
          attributes: ["id", "name", "room"],
        },
      ],
      order: [["start_time", "ASC"]],
    });

    const formattedSessions = todaySessions.map(session => ({
        id: session.id,
        title: session.classInfo.name,
        date: session.start_time.toLocaleDateString('vi-VN'),
        time: `${session.start_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit'})} - ${session.end_time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit'})}`,
        location: `Room ${session.classInfo.room || 'TBA'}`
    }));

    const formattedClasses = enrollments.map(e => ({
        id: e.classInfo.id,
        name: e.classInfo.name,
        teacher: e.classInfo.teacherInfo ? e.classInfo.teacherInfo.display_name : "N/A",
        room: e.classInfo.room || "TBA"
    }));

    return {
      classes: formattedClasses,
      upcomingAssessments,
      todaySessions: formattedSessions,
      recentGrades: [] // Implement later if needed
    };
  },

  getMyClasses: async (studentId) => {
    const enrollments = await Enrollment.findAll({
      where: { user_id: studentId },
      include: [
        {
          model: Class,
          as: "classInfo",
          include: [
            {
              model: User,
              as: "teacherInfo",
              attributes: ["id", "display_name"],
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
        const c = e.classInfo;
        
        // Format schedule from sessions
        const schedule = c.sessions.map(s => {
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
            teacher: c.teacherInfo ? c.teacherInfo.display_name : "N/A",
            room: c.room || "TBA",
            schedule: schedule
        };
    });
  },

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
          as: "teacherInfo",
          attributes: ["id", "display_name"],
        },
        {
           model: ClassSession,
           as: "sessions",
           attributes: ["start_time", "end_time"],
           order: [["start_time", "ASC"]]
        }
      ],
    });

    if (!cl) {
        throw new Error("Class not found");
    }

    const studentsCount = await Enrollment.count({ where: { class_id: classId }});

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
    const announcements = await Notification.findAll({
      where: { class_id: classId, type: "ANNOUNCEMENT" }, // assuming type exists, or omit
      order: [["created_at", "DESC"]],
    });

    return {
      id: cl.id,
      name: cl.name,
      teacher: cl.teacherInfo ? cl.teacherInfo.display_name : "N/A",
      room: cl.room || "TBA",
      studentsCount,
      schedule: cl.sessions.map(s => ({
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
          points: a.type === 'QUIZ' ? '100' : '100', // adjust based on schema
      })),
      announcements: announcements.map(a => ({
          id: a.id,
          title: a.title,
          content: a.message,
          date: a.created_at.toLocaleString('en-US')
      }))
    };
  },
};
