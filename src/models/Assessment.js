import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Assessment extends Model {}

export function initAssessment(sequelize) {
  Assessment.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      class_id: { type: DataTypes.UUID, allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: false },
      type: {
        type: DataTypes.ENUM("QUIZ", "ESSAY"),
        allowNull: false,
      },
      title: { type: DataTypes.TEXT, allowNull: false },
      instructions: { type: DataTypes.TEXT },
      due_at: { type: DataTypes.DATE },
      time_limit_minutes: { type: DataTypes.INTEGER },
      attempt_limit: { type: DataTypes.INTEGER },
      status: {
        type: DataTypes.ENUM("draft", "published", "closed"),
        allowNull: false,
        defaultValue: "draft",
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "assessments",
      timestamps: false,
      indexes: [
        { name: "idx_assessments_class", fields: ["class_id"] },
        { name: "idx_assessments_created_by", fields: ["created_by"] },
      ],
    },
  );
}

export default Assessment;
