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
      class_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      status: {
        type: DataTypes.ENUM("active", "dropped"),
        allowNull: false,
        defaultValue: "active",
      },
      joined_at: {
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
        { name: "idx_enrollments_student", fields: ["user_id"] },
        { name: "idx_enrollments_class", fields: ["class_id"] },
        {
          name: "idx_enrollments_class_student",
          fields: ["class_id", "user_id"],
          unique: true,
        },
      ],
    },
  );
}

export default Enrollment;
