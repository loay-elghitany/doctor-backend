import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import Admin from "./models/Admin.js";

dotenv.config();

// connect to DB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

const seedAdmin = async () => {
  try {
    const existingAdmin = await Admin.findOne({
      email: process.env.ADMIN_EMAIL,
    });

    if (existingAdmin) {
      console.log("Admin already exists");
      process.exit();
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, salt);

    const admin = await Admin.create({
      email: process.env.ADMIN_EMAIL,
      password: hashedPassword,
    });

    console.log("Admin created:", {
      id: admin._id,
      email: admin.email,
    });
    process.exit();
  } catch (error) {
    console.error("Error creating admin:", error);
    process.exit(1);
  }
};

seedAdmin();
