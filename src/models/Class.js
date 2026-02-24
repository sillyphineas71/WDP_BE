import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Class extends Model {}

export function initClass(sequelize) {
  Class.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      course_id: { type: DataTypes.UUID, allowNull: false },
      teacher_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.TEXT, allowNull: false },
      start_date: { type: DataTypes.DATEONLY, allowNull: false },
      end_date: { type: DataTypes.DATEONLY },
      status: {
        type: DataTypes.ENUM("active", "closed"),
        allowNull: false,
        defaultValue: "active",
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "classes",
      timestamps: false,
      indexes: [
        { name: "idx_classes_course", fields: ["course_id"] },
        { name: "idx_classes_teacher", fields: ["teacher_id"] },
      ],
    },
  );
}

export default Class;
