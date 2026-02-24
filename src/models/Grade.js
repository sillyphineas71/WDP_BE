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
      user_id: { type: DataTypes.UUID, allowNull: false },
      assessment_id: { type: DataTypes.UUID, allowNull: false },
      score: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      feedback: { type: DataTypes.TEXT },
      graded_by: { type: DataTypes.UUID, allowNull: false },
      graded_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "grades",
      timestamps: false,
      indexes: [
        { name: "idx_grades_user", fields: ["user_id"] },
        { name: "idx_grades_assessment", fields: ["assessment_id"] },
        {
          name: "idx_grades_user_assessment",
          fields: ["user_id", "assessment_id"],
          unique: true,
        },
      ],
    },
  );
}

export default Grade;
