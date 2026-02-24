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
      import_job_id: { type: DataTypes.UUID, allowNull: false },
      row_number: { type: DataTypes.INTEGER, allowNull: false },
      row_data: { type: DataTypes.JSON, allowNull: false },
      status: {
        type: DataTypes.ENUM("pending", "success", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      error_message: { type: DataTypes.TEXT },
      processed_at: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "import_rows",
      timestamps: false,
      indexes: [{ name: "idx_import_rows_job", fields: ["import_job_id"] }],
    },
  );
}

export default ImportRow;
