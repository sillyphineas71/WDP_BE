import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class ClassSession extends Model {}

export function initClassSession(sequelize) {
  ClassSession.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      class_id: { type: DataTypes.UUID, allowNull: false },
      session_number: { type: DataTypes.INTEGER, allowNull: false },
      title: { type: DataTypes.TEXT, allowNull: false },
      description: { type: DataTypes.TEXT },
      scheduled_date: { type: DataTypes.DATE, allowNull: false },
      duration_minutes: { type: DataTypes.INTEGER },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "class_sessions",
      timestamps: false,
      indexes: [{ name: "idx_class_sessions_class", fields: ["class_id"] }],
    },
  );
}

export default ClassSession;
