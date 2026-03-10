import { Sequelize } from "sequelize";

const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    timezone: "+00:00",
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  })
  : new Sequelize({
    dialect: "sqlite",
    storage: "./database.sqlite",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
  });

export default sequelize;