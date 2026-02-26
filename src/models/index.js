import { initRole, Role } from "./Role.js";
import { initUser, User } from "./User.js";
import {
  initPasswordResetToken,
  PasswordResetToken,
} from "./PasswordResetToken.js";
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

export function initModels(sequelize) {
  // Initialize all models
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

  // Define associations
  // Role associations
  Role.hasMany(User, { foreignKey: "role_id", as: "users" });
  User.belongsTo(Role, { foreignKey: "role_id", as: "role" });

  // User associations
  User.hasMany(PasswordResetToken, {
    foreignKey: "user_id",
    as: "resetTokens",
  });
  PasswordResetToken.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(Class, { foreignKey: "teacher_id", as: "taughtClasses" });
  Class.belongsTo(User, { foreignKey: "teacher_id", as: "teacher" });

  User.hasMany(Enrollment, { foreignKey: "user_id", as: "enrollments" });
  Enrollment.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(AttendanceRecord, {
    foreignKey: "user_id",
    as: "attendanceRecords",
  });
  AttendanceRecord.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(ImportJob, { foreignKey: "user_id", as: "importJobs" });
  ImportJob.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(Submission, { foreignKey: "user_id", as: "submissions" });
  Submission.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(Grade, { foreignKey: "user_id", as: "grades" });
  Grade.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(Grade, { foreignKey: "graded_by", as: "gradedByMe" });

  User.hasMany(Notification, { foreignKey: "user_id", as: "notifications" });
  Notification.belongsTo(User, { foreignKey: "user_id", as: "user" });

  User.hasMany(Submission, {
    foreignKey: "graded_by",
    as: "submissionsGradedByMe",
  });
  Submission.belongsTo(User, { foreignKey: "graded_by", as: "gradedBy" });

  // Course associations
  Course.hasMany(Class, { foreignKey: "course_id", as: "classes" });
  Class.belongsTo(Course, { foreignKey: "course_id", as: "course" });

  // Class associations
  Class.hasMany(Enrollment, { foreignKey: "class_id", as: "enrollments" });
  Enrollment.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  Class.hasMany(ClassSession, { foreignKey: "class_id", as: "sessions" });
  ClassSession.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  Class.hasMany(Material, { foreignKey: "class_id", as: "materials" });
  Material.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  Class.hasMany(Assessment, { foreignKey: "class_id", as: "assessments" });
  Assessment.belongsTo(Class, { foreignKey: "class_id", as: "class" });

  // ClassSession associations
  ClassSession.hasMany(AttendanceRecord, {
    foreignKey: "class_session_id",
    as: "attendanceRecords",
  });
  AttendanceRecord.belongsTo(ClassSession, {
    foreignKey: "class_session_id",
    as: "session",
  });

  // Assessment associations
  Assessment.hasMany(AssessmentFile, {
    foreignKey: "assessment_id",
    as: "files",
  });
  AssessmentFile.belongsTo(Assessment, {
    foreignKey: "assessment_id",
    as: "assessment",
  });

  Assessment.hasMany(QuizQuestion, {
    foreignKey: "assessment_id",
    as: "questions",
  });
  QuizQuestion.belongsTo(Assessment, {
    foreignKey: "assessment_id",
    as: "assessment",
  });

  Assessment.hasMany(Submission, {
    foreignKey: "assessment_id",
    as: "submissions",
  });
  Submission.belongsTo(Assessment, {
    foreignKey: "assessment_id",
    as: "assessment",
  });

  Assessment.hasMany(Grade, { foreignKey: "assessment_id", as: "grades" });
  Grade.belongsTo(Assessment, {
    foreignKey: "assessment_id",
    as: "assessment",
  });

  // QuizQuestion associations
  QuizQuestion.hasMany(QuizOption, {
    foreignKey: "question_id",
    as: "options",
  });
  QuizOption.belongsTo(QuizQuestion, {
    foreignKey: "question_id",
    as: "question",
  });

  QuizQuestion.hasMany(SubmissionAnswer, {
    foreignKey: "question_id",
    as: "submissionAnswers",
  });
  SubmissionAnswer.belongsTo(QuizQuestion, {
    foreignKey: "question_id",
    as: "question",
  });

  // Submission associations
  Submission.hasMany(SubmissionAnswer, {
    foreignKey: "submission_id",
    as: "answers",
  });
  SubmissionAnswer.belongsTo(Submission, {
    foreignKey: "submission_id",
    as: "submission",
  });

  Submission.hasMany(SubmissionFile, {
    foreignKey: "submission_id",
    as: "files",
  });
  SubmissionFile.belongsTo(Submission, {
    foreignKey: "submission_id",
    as: "submission",
  });

  // ImportJob associations
  ImportJob.hasMany(ImportRow, { foreignKey: "import_job_id", as: "rows" });
  ImportRow.belongsTo(ImportJob, {
    foreignKey: "import_job_id",
    as: "importJob",
  });

  ImportJob.belongsTo(Class, { foreignKey: "class_id", as: "class" });
  Class.hasMany(ImportJob, { foreignKey: "class_id", as: "importJobs" });

  return {
    Role,
    User,
    PasswordResetToken,
    Course,
    Class,
    Enrollment,
    ClassSession,
    AttendanceRecord,
    Material,
    Assessment,
    AssessmentFile,
    QuizQuestion,
    QuizOption,
    ImportJob,
    ImportRow,
    Submission,
    SubmissionAnswer,
    SubmissionFile,
    Grade,
    Notification,
  };
}
import sequelize from "../config/database.js";
export {
  sequelize,
  Role,
  User,
  PasswordResetToken,
  Course,
  Class,
  Enrollment,
  ClassSession,
  AttendanceRecord,
  Material,
  Assessment,
  AssessmentFile,
  QuizQuestion,
  QuizOption,
  ImportJob,
  ImportRow,
  Submission,
  SubmissionAnswer,
  SubmissionFile,
  Grade,
  Notification,
};
