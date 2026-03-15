import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Submission extends Model {}

export function initSubmission(sequelize) {
  Submission.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      assessment_id: { type: DataTypes.UUID, allowNull: false },
      student_id: { type: DataTypes.UUID, allowNull: false },
      attempt_no: { type: DataTypes.INTEGER, defaultValue: 1 },
      status: { 
        type: DataTypes.STRING, // Khớp với kiểu submission_status trong DB
        defaultValue: "submitted" 
      },
      started_at: { type: DataTypes.DATE },
      submitted_at: { type: DataTypes.DATE },
      content_text: { type: DataTypes.TEXT },
    },
    {
      sequelize,
      tableName: "submissions",
      timestamps: false, // Bảng của bạn không thấy có created_at/updated_at trong ảnh
    }
  );
}