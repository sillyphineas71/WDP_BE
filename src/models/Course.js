import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Course extends Model {}

export function initCourse(sequelize) {
  Course.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      code: { type: DataTypes.TEXT, allowNull: false, unique: true },
      name: { type: DataTypes.TEXT, allowNull: false },
      description: { type: DataTypes.TEXT },
      expected_sessions: { type: DataTypes.INTEGER },
      status: { type: DataTypes.TEXT, defaultValue: "active" },
      is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    { sequelize, tableName: "courses", timestamps: false },
  );
}

export default Course;
