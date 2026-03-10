// src/models/index.js
import { initRole, Role } from "./Role.js";
import { initUser, User } from "./User.js";
import { initPasswordResetToken, PasswordResetToken } from "./PasswordResetToken.js";
import { initCourse, Course } from "./Course.js";
import { initClass, Class } from "./Class.js";
import { initEnrollment, Enrollment } from "./Enrollment.js";
import { initClassSession, ClassSession } from "./ClassSession.js";
import { initAttendanceRecord, AttendanceRecord } from "./AttendanceRecord.js";
import { initMaterial, Material } from "./Material.js";
import { initAssessment, Assessment } from "./Assessment.js";
import { initAssessmentFile, AssessmentFile } from "./AssessmentFile.js";
import { initQuizQuestion, QuizQuestion } from "./QuizQuestion.js";
import { initQuizOption, QuizOption } from "./QuizOption.js";
import { initImportJob, ImportJob } from "./ImportJob.js";
import { initImportRow, ImportRow } from "./ImportRow.js";
import { initSubmission, Submission } from "./Submission.js";
import { initSubmissionAnswer, SubmissionAnswer } from "./SubmissionAnswer.js";
import { initSubmissionFile, SubmissionFile } from "./SubmissionFile.js";
import { initGrade, Grade } from "./Grade.js";
import { initNotification, Notification } from "./Notification.js";
import sequelize from "../config/database.js";

export function initModels(sequelize) {
  // 1. Khởi tạo tất cả models
  initRole(sequelize);
  initUser(sequelize);
  initPasswordResetToken(sequelize);
  initCourse(sequelize);
  initClass(sequelize);
  initEnrollment(sequelize);
  initClassSession(sequelize);
  initAttendanceRecord(sequelize);
  initMaterial(sequelize);
  initAssessment(sequelize);
  initAssessmentFile(sequelize);
  initQuizQuestion(sequelize);
  initQuizOption(sequelize);
  initImportJob(sequelize);
  initImportRow(sequelize);
  initSubmission(sequelize);
  initSubmissionAnswer(sequelize);
  initSubmissionFile(sequelize);
  initGrade(sequelize);
  initNotification(sequelize);

  // 2. Định nghĩa quan hệ (Associations)

  // Role & User
  Role.hasMany(User, { foreignKey: "role_id", as: "users" });
  User.belongsTo(Role, { foreignKey: "role_id", as: "role" });

  // User & Password Tokens
  User.hasMany(PasswordResetToken, { foreignKey: "user_id", as: "resetTokens" });
  PasswordResetToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

  // Teacher & Classes
  User.hasMany(Class, { foreignKey: "teacher_id", as: "taughtClasses" });
  Class.belongsTo(User, { foreignKey: "teacher_id", as: "teacher" });

  // Student & Enrollments
  User.hasMany(Enrollment, { foreignKey: "user_id", as: "enrollments" });
  Enrollment.belongsTo(User, { foreignKey: "user_id", as: "student" });

  // Course & Class
  Course.hasMany(Class, { foreignKey: "course_id", as: "classes" });
  Class.belongsTo(Course, { foreignKey: "course_id", as: "course" });

  // Class & Sub-resources
  Class.hasMany(Enrollment, { foreignKey: "class_id", as: "enrollments" });
  Enrollment.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  Class.hasMany(ClassSession, { foreignKey: "class_id", as: "sessions" });
  ClassSession.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  Class.hasMany(Material, { foreignKey: "class_id", as: "materials" });
  Material.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  Class.hasMany(Assessment, { foreignKey: "class_id", as: "assessments" });
  Assessment.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  // Student & Submissions
  User.hasMany(Submission, { foreignKey: "student_id", as: "submissions" });
  Submission.belongsTo(User, { foreignKey: "student_id", as: "student" });

  // Assessment & Files
  Assessment.hasMany(AssessmentFile, { foreignKey: 'assessment_id', as: 'files' });
  AssessmentFile.belongsTo(Assessment, { foreignKey: 'assessment_id', as: 'assessment' });

  // ClassSession & Materials (from dev branch)
  ClassSession.hasMany(Material, {
    foreignKey: "session_id",
    as: "materials",
  });
  Material.belongsTo(ClassSession, {
    foreignKey: "session_id",
    as: "session",
  });

  // Assessment & Questions/Submissions (from minh-branch)
  Assessment.hasMany(QuizQuestion, { foreignKey: "assessment_id", as: "questions" });
  QuizQuestion.belongsTo(Assessment, { foreignKey: "assessment_id", as: "assessment" });

  Assessment.hasMany(Submission, { foreignKey: "assessment_id", as: "submissions" });
  Submission.belongsTo(Assessment, { foreignKey: "assessment_id", as: "assessment" });

  // Submission & Answers/Files/Grades
  Submission.hasMany(SubmissionAnswer, { foreignKey: "submission_id", as: "answers" });
  SubmissionAnswer.belongsTo(Submission, { foreignKey: "submission_id", as: "submission" });

  Submission.hasMany(SubmissionFile, { foreignKey: "submission_id", as: "files" });
  SubmissionFile.belongsTo(Submission, { foreignKey: "submission_id", as: "submission" });

  // Grade nối với Submission
  Submission.hasOne(Grade, { foreignKey: "submission_id", as: "grade" });
  Grade.belongsTo(Submission, { foreignKey: "submission_id", as: "submission" });

  // Notification
  User.hasMany(Notification, { foreignKey: "user_id", as: "notifications" });
  Notification.belongsTo(User, { foreignKey: "user_id", as: "user" });

  return {
    Role, User, PasswordResetToken, Course, Class, Enrollment,
    ClassSession, AttendanceRecord, Material, Assessment, AssessmentFile,
    QuizQuestion, QuizOption, ImportJob, ImportRow, Submission,
    SubmissionAnswer, SubmissionFile, Grade, Notification,
  };
}

export {
  sequelize, Role, User, PasswordResetToken, Course, Class, Enrollment,
  ClassSession, AttendanceRecord, Material, Assessment, AssessmentFile,
  QuizQuestion, QuizOption, ImportJob, ImportRow, Submission,
  SubmissionAnswer, SubmissionFile, Grade, Notification,
};