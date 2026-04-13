import mongoose from "mongoose";
import logger from "../utils/logger.js";

const getConnectionString = () => process.env.DB_URI || process.env.MONGO_URI;

const connectDB = async (connectionString) => {
  const uri = connectionString || getConnectionString();
  if (!uri) {
    logger.error("DBValidation", "Database URI is required");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    logger.info("MongoDB", "MongoDB connected");
  } catch (error) {
    logger.error("MongoDBError", error);
    process.exit(1);
  }
};

export default connectDB;
