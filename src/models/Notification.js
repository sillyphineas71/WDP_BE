import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Notification extends Model {}

export function initNotification(sequelize) {
  Notification.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      title: { type: DataTypes.TEXT, allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      notification_type: { type: DataTypes.TEXT, allowNull: false },
      is_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      read_at: { type: DataTypes.DATE },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "notifications",
      timestamps: false,
      indexes: [
        { name: "idx_notifications_user", fields: ["user_id"] },
        { name: "idx_notifications_read", fields: ["is_read"] },
      ],
    },
  );
}

export default Notification;
