import dotenv from "dotenv";
import mongoose from "mongoose";
import Doctor from "../models/Doctor.js";

dotenv.config();

const getConnectionUri = () => process.env.DB_URI || process.env.MONGO_URI;

const buildDefaultPayload = (doctor) => {
  const update = {};

  if (doctor.bio === undefined) update.bio = "";
  if (doctor.specialty === undefined) update.specialty = "";
  if (doctor.profilePicture === undefined) update.profilePicture = "";
  if (!Array.isArray(doctor.clinicPhotos)) update.clinicPhotos = [];

  const socialLinks = doctor.socialLinks || {};
  if (doctor.socialLinks === undefined) {
    update.socialLinks = { facebook: "", instagram: "", twitter: "" };
  } else {
    const mergedSocial = {
      facebook: socialLinks.facebook ?? "",
      instagram: socialLinks.instagram ?? "",
      twitter: socialLinks.twitter ?? "",
    };
    if (
      mergedSocial.facebook !== socialLinks.facebook ||
      mergedSocial.instagram !== socialLinks.instagram ||
      mergedSocial.twitter !== socialLinks.twitter
    ) {
      update.socialLinks = mergedSocial;
    }
  }

  const landingPageSettings = doctor.landingPageSettings || {};
  if (doctor.landingPageSettings === undefined) {
    update.landingPageSettings = { themeColor: "#2563eb", welcomeMessage: "" };
  } else {
    const mergedSettings = {
      themeColor: landingPageSettings.themeColor ?? "#2563eb",
      welcomeMessage: landingPageSettings.welcomeMessage ?? "",
    };
    if (
      mergedSettings.themeColor !== landingPageSettings.themeColor ||
      mergedSettings.welcomeMessage !== landingPageSettings.welcomeMessage
    ) {
      update.landingPageSettings = mergedSettings;
    }
  }

  return update;
};

const runMigration = async () => {
  const connectionUri = getConnectionUri();
  if (!connectionUri) {
    console.error("DB_URI or MONGO_URI must be provided");
    process.exit(1);
  }

  try {
    await mongoose.connect(connectionUri);

    const doctors = await Doctor.find({}).select(
      "_id bio specialty profilePicture clinicPhotos socialLinks landingPageSettings",
    );

    let modifiedCount = 0;
    for (const doctor of doctors) {
      const update = buildDefaultPayload(doctor);
      if (Object.keys(update).length > 0) {
        await Doctor.updateOne({ _id: doctor._id }, { $set: update });
        modifiedCount += 1;
      }
    }

    console.log(
      `Doctor profile defaults migration completed. Checked: ${doctors.length}, Modified: ${modifiedCount}`,
    );
    process.exit(0);
  } catch (error) {
    console.error("Doctor profile defaults migration failed:", error);
    process.exit(1);
  }
};

runMigration();
