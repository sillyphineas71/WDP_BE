import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Role extends Model {}

export function initRole(sequelize) {
  Role.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      code: {
        type: DataTypes.ENUM("ADMIN", "TEACHER", "STUDENT"),
        allowNull: false,
        //unique: true,
      },
      name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      sequelize,
      tableName: "roles",
      timestamps: false,
    },
  );
}

export default Role;
