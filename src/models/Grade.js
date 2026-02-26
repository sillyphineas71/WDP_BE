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
      submission_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      ai_score_draft: { type: DataTypes.DECIMAL(5, 2) },
      ai_feedback_json: { type: DataTypes.JSON },
      final_score: { type: DataTypes.DECIMAL(5, 2) },
      final_feedback: { type: DataTypes.TEXT },
      graded_by: { type: DataTypes.UUID },
      graded_at: { type: DataTypes.DATE },
      status: {
        type: DataTypes.ENUM("ai_drafted", "finalized"),
        allowNull: false,
        defaultValue: "ai_drafted",
      },
      is_published: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      published_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "grades",
      timestamps: false,
      indexes: [
        { name: "idx_grades_submission", fields: ["submission_id"] },
        { name: "idx_grades_graded_by", fields: ["graded_by"] },
      ],
    },
  );
}

export default Grade;
