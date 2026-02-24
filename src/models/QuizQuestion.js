import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class QuizQuestion extends Model {}

export function initQuizQuestion(sequelize) {
  QuizQuestion.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      assessment_id: { type: DataTypes.UUID, allowNull: false },
      question_number: { type: DataTypes.INTEGER, allowNull: false },
      question_text: { type: DataTypes.TEXT, allowNull: false },
      question_type: {
        type: DataTypes.ENUM("multiple_choice", "short_answer", "essay"),
        allowNull: false,
      },
      points: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      correct_answer: { type: DataTypes.TEXT },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "quiz_questions",
      timestamps: false,
      indexes: [
        { name: "idx_quiz_questions_assessment", fields: ["assessment_id"] },
      ],
    },
  );
}

export default QuizQuestion;
