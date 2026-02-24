import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class User extends Model {}

export function initUser(sequelize) {
  User.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      role_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      email: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      full_name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      phone: {
        type: DataTypes.TEXT,
      },
      avatar_url: {
        type: DataTypes.TEXT,
      },
      bio: {
        type: DataTypes.TEXT,
      },
      status: {
        type: DataTypes.ENUM("active", "blocked"),
        allowNull: false,
        defaultValue: "active",
      },
      must_change_password: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      password_changed_at: {
        type: DataTypes.DATE,
      },
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
      tableName: "users",
      timestamps: false,
    },
  );
}

export default User;
