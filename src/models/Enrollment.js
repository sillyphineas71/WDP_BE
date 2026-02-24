import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Enrollment extends Model {}

export function initEnrollment(sequelize) {
  Enrollment.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      class_id: { type: DataTypes.UUID, allowNull: false },
      status: {
        type: DataTypes.ENUM("active", "dropped", "completed"),
        allowNull: false,
        defaultValue: "active",
      },
      enrolled_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "enrollments",
      timestamps: false,
      indexes: [
        { name: "idx_enrollments_user", fields: ["user_id"] },
        { name: "idx_enrollments_class", fields: ["class_id"] },
        {
          name: "idx_enrollments_user_class",
          fields: ["user_id", "class_id"],
          unique: true,
        },
      ],
    },
  );
}

export default Enrollment;
