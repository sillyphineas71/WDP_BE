import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class QuizOption extends Model {}

export function initQuizOption(sequelize) {
  QuizOption.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      question_id: { type: DataTypes.UUID, allowNull: false },
      option_text: { type: DataTypes.TEXT, allowNull: false },
      is_correct: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      display_order: { type: DataTypes.INTEGER, allowNull: false },
    },
    {
      sequelize,
      tableName: "quiz_options",
      timestamps: false,
      indexes: [{ name: "idx_quiz_options_question", fields: ["question_id"] }],
    },
  );
}

export default QuizOption;
