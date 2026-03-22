import mongoose from "mongoose";
import dotenv from "dotenv";
import { uploadMedicalFile } from "./src/controllers/medicalFileController.js";
import MedicalFile from "./src/models/MedicalFile.js";

dotenv.config();

// connect DB
mongoose.connect(process.env.MONGO_URI).then(() => console.log("DB connected"));

// mimic req/res
const fakeReq = {
  user: {
    _id: "69a18156fdd8dc654fd1c197",
    doctorId: "69a18156fdd8dc654fd1c194",
  },
  file: {
    filename: "fake.pdf",
    originalname: "fake.pdf",
    size: 123,
  },
  body: {},
};
const fakeRes = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(obj) {
    console.log("response", this.statusCode || 200, obj);
    return this;
  },
};

// call inner function directly (skip multer middleware)
(async () => {
  try {
    await uploadMedicalFile[1](fakeReq, fakeRes);
  } catch (err) {
    console.error("outer error", err);
  } finally {
    mongoose.connection.close();
  }
})();
