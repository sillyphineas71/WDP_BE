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
      title: { type: DataTypes.TEXT, allowNull: false },
      description: { type: DataTypes.TEXT },
      assessment_type: {
        type: DataTypes.ENUM("assignment", "quiz", "exam", "project"),
        allowNull: false,
      },
      max_score: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      weight: { type: DataTypes.DECIMAL(5, 2) },
      due_date: { type: DataTypes.DATE },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "assessments",
      timestamps: false,
      indexes: [{ name: "idx_assessments_class", fields: ["class_id"] }],
    },
  );
}

export default Assessment;
