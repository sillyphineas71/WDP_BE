import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Grade extends Model {}

export function initGrade(sequelize) {
  Grade.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      submission_id: { type: DataTypes.UUID, allowNull: false },
      ai_score_draft: { type: DataTypes.DECIMAL(6, 2) },
      ai_feedback_json: { type: DataTypes.JSONB },
      final_score: { type: DataTypes.DECIMAL(6, 2) }, // Đây là cột score của bạn
      final_feedback: { type: DataTypes.TEXT },      // Đây là cột feedback của bạn
      graded_by: { type: DataTypes.UUID },
      graded_at: { type: DataTypes.DATE },
      status: { type: DataTypes.STRING }, // grade_status
      is_published: { type: DataTypes.BOOLEAN, defaultValue: false },
      published_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "grades",
      timestamps: false,
    }
  );
}

export default Grade;