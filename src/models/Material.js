import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class Material extends Model {}

export function initMaterial(sequelize) {
  Material.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      class_id: { type: DataTypes.UUID, allowNull: false },
      title: { type: DataTypes.TEXT, allowNull: false },
      description: { type: DataTypes.TEXT },
      file_url: { type: DataTypes.TEXT },
      file_type: { type: DataTypes.TEXT },
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
      tableName: "materials",
      timestamps: false,
      indexes: [{ name: "idx_materials_class", fields: ["class_id"] }],
    },
  );
}

export default Material;
