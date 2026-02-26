import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class SubmissionAnswer extends Model {}

export function initSubmissionAnswer(sequelize) {
  SubmissionAnswer.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      submission_id: { type: DataTypes.UUID, allowNull: false },
      question_id: { type: DataTypes.UUID, allowNull: false },
      selected_option_id: { type: DataTypes.UUID },
      answer_text: { type: DataTypes.TEXT },
      is_correct: { type: DataTypes.BOOLEAN },
      score: { type: DataTypes.DECIMAL(5, 2) },
    },
    {
      sequelize,
      tableName: "submission_answers",
      timestamps: false,
      indexes: [
        {
          name: "idx_submission_answers_submission",
          fields: ["submission_id"],
        },
        { name: "idx_submission_answers_question", fields: ["question_id"] },
      ],
    },
  );
}

export default SubmissionAnswer;
