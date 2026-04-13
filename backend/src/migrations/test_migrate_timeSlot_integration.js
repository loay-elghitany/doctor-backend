import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import Appointment from "../models/Appointment.js";
import migrate from "./migrate_timeSlot_from_date.js";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";


const runTest = async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();

  logger.debug("Starting in-memory MongoDB for integration test...");
  process.env.MONGO_URI = uri;

  // Connect and seed raw documents (bypass Mongoose defaults by using collection inserts)
  await mongoose.connect(uri);
  const coll = mongoose.connection.collection("appointments");

  // Clear if any
  await coll.deleteMany({});

  // Prepare sample docs
  const doctorId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId();

  const validDate = new Date("2026-02-10T14:45:00Z");

  const docs = [
    // 1) Missing timeSlot, valid date
    {
      doctorId,
      patientId,
      date: validDate,
      status: "PENDING",
    },

    // 2) Missing timeSlot, invalid date (string that cannot be parsed)
    {
      doctorId,
      patientId,
      date: "not-a-valid-date",
      status: "PENDING",
    },

    // 3) Missing timeSlot, date omitted entirely
    {
      doctorId,
      patientId,
      status: "PENDING",
    },

    // 4) Existing timeSlot should remain unchanged
    {
      doctorId,
      patientId,
      date: new Date("2026-02-11T08:30:00Z"),
      timeSlot: "08:30",
      status: "PENDING",
    },
  ];

  const insertResult = await coll.insertMany(docs);
  logger.debug(`Inserted ${insertResult.insertedCount} sample documents.`);

  // Run migration first time
  logger.debug("Running migration (1st run)...");
  await migrate({ dryRun: false });

  // Fetch all docs and validate
  const all = await Appointment.find({}).lean();

  let pass = true;

  // Helper: extract HH:MM from Date using same logic as migration
  const extractHHMM = (d) => {
    const dt = new Date(d);
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  for (const doc of all) {
    if (!doc.timeSlot) {
      logger.error(
        `FAIL: Appointment ${doc._id} has no timeSlot after migration`,
      );
      pass = false;
      continue;
    }

    // Identify the sample cases by comparing inserted IDs
    // Find matching original by date or explicit timeSlot
    if (doc.timeSlot === "08:30") {
      // existing timezone-preserved slot should remain unchanged
      logger.debug(
        `OK: Appointment ${doc._id} preserved existing timeSlot 08:30`,
      );
      continue;
    }

    if (doc.date) {
      // For the valid date sample, we expect extraction to match
      const original = docs.find(
        (d) =>
          d.date && new Date(d.date).getTime() === new Date(doc.date).getTime(),
      );
      if (
        original &&
        original.date instanceof Date &&
        !isNaN(original.date.getTime())
      ) {
        const expected = extractHHMM(original.date);
        if (doc.timeSlot !== expected) {
          logger.error(
            `FAIL: Appointment ${doc._id} timeSlot '${doc.timeSlot}' != expected '${expected}' from date ${original.date}`,
          );
          pass = false;
        } else {
          logger.debug(
            `OK: Appointment ${doc._id} timeSlot correctly extracted '${expected}'`,
          );
        }
        continue;
      }
    }

    // For invalid or missing dates, expect default
    if (doc.timeSlot === "09:00") {
      logger.debug(`OK: Appointment ${doc._id} received default timeSlot 09:00`);
    } else {
      logger.error(
        `FAIL: Appointment ${doc._id} unexpected timeSlot '${doc.timeSlot}'`,
      );
      pass = false;
    }
  }

  // Run migration a second time to verify idempotency
  logger.debug("Running migration (2nd run) to verify idempotency...");
  await migrate({ dryRun: false });
  const afterSecond = await Appointment.find({}).lean();

  // Ensure no timeSlot values changed between runs
  for (let i = 0; i < all.length; i++) {
    const before = all[i];
    const after = afterSecond.find((d) => String(d._id) === String(before._id));
    if (!after) continue;
    if (before.timeSlot !== after.timeSlot) {
      logger.error(
        `FAIL: Appointment ${before._id} timeSlot changed between runs: '${before.timeSlot}' -> '${after.timeSlot}'`,
      );
      pass = false;
    }
  }

  if (pass) {
    logger.debug("INTEGRATION TEST PASSED: Migration behavior as expected.");
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(0);
  } else {
    logger.error("INTEGRATION TEST FAILED: See errors above.");
    await mongoose.disconnect();
    await mongod.stop();
    process.exit(2);
  }
};

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename) {
  runTest();
}
