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
      attempt_no: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: DataTypes.ENUM("in_progress", "submitted", "graded"),
        allowNull: false,
        defaultValue: "in_progress",
      },
      started_at: { type: DataTypes.DATE, allowNull: false },
      submitted_at: { type: DataTypes.DATE },
      content_text: { type: DataTypes.TEXT },
    },
    {
      sequelize,
      tableName: "submissions",
      timestamps: false,
      indexes: [
        { name: "idx_submissions_assessment", fields: ["assessment_id"] },
        { name: "idx_submissions_student", fields: ["student_id"] },
        {
          name: "idx_submissions_assessment_student_attempt",
          fields: ["assessment_id", "student_id", "attempt_no"],
          unique: true,
        },
      ],
    },
  );
}

export default Submission;
