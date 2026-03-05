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
      user_id: { type: DataTypes.UUID, allowNull: false },
      submitted_at: { type: DataTypes.DATE },
      is_late: { type: DataTypes.BOOLEAN, defaultValue: false },
      score: { type: DataTypes.DECIMAL(5, 2) },
      feedback: { type: DataTypes.TEXT },
      graded_by: { type: DataTypes.UUID },
      graded_at: { type: DataTypes.DATE },
      submission_status: {
        type: DataTypes.ENUM("pending", "submitted", "graded"),
        defaultValue: "pending",
      },
    },
    {
      sequelize,
      tableName: "submissions",
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
      indexes: [
        { name: "idx_submissions_assessment", fields: ["assessment_id"] },
        { name: "idx_submissions_user", fields: ["user_id"] },
      ],
    },
  );
}

export default Submission;
