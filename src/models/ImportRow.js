import { DataTypes, Model } from "sequelize";
import { v4 as uuidv4 } from "uuid";

export class ImportRow extends Model {}

export function initImportRow(sequelize) {
  ImportRow.init(
    {
      id: {
        type: DataTypes.UUID,
        primaryKey: true,
        defaultValue: () => uuidv4(),
      },
      job_id: { type: DataTypes.UUID, allowNull: false },
      row_number: { type: DataTypes.INTEGER, allowNull: false },
      payload_json: { type: DataTypes.JSON, allowNull: false },
      status: {
        type: DataTypes.ENUM("ok", "error"),
        allowNull: false,
        defaultValue: "ok",
      },
      error_message: { type: DataTypes.TEXT },
      created_entity_id: { type: DataTypes.UUID },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "import_rows",
      timestamps: false,
      indexes: [{ name: "idx_import_rows_job", fields: ["job_id"] }],
    },
  );
}

export default ImportRow;
