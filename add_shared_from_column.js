import "dotenv/config";
import sequelize from "./src/config/database.js";

async function addColumn() {
  try {
    await sequelize.authenticate();
    await sequelize.query('ALTER TABLE assessments ADD COLUMN IF NOT EXISTS shared_from UUID;');
    console.log("Column shared_from added successfully");
    process.exit(0);
  } catch (error) {
    console.error("Error adding column:", error);
    process.exit(1);
  }
}

addColumn();
