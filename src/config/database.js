import { Sequelize } from "sequelize";

const sequelize = new Sequelize(process.env.DATABASE_URL || "", {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  timezone: "+00:00",
});

export default sequelize;
