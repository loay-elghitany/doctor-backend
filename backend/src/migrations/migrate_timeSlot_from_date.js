import dotenv from "dotenv";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname } from "path";
import connectDB from "../config/db.js";
import Appointment from "../models/Appointment.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);

const TIME_SLOT_DEFAULT = "09:00";
const TIME_SLOT_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Migration:
 * - Finds appointments where `timeSlot` is missing/null/empty
 * - Extracts time (HH:MM) from the existing `date` field and sets `timeSlot`
 * - If date is missing or malformed, sets `timeSlot` to a safe default (09:00)
 * - Idempotent: only updates documents where `timeSlot` is still missing
 */
const migrate = async ({ dryRun = false } = {}) => {
  try {
    const query = {
      $or: [
        { timeSlot: { $exists: false } },
        { timeSlot: null },
        { timeSlot: "" },
      ],
    };

    const totalToProcess = await Appointment.countDocuments(query);
    console.log(`Found ${totalToProcess} appointment(s) missing timeSlot.`);

    if (totalToProcess === 0) {
      return;
    }

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    const cursor = Appointment.find(query).cursor();

    for await (const appt of cursor) {
      processed++;

      try {
        const rawDate = appt.date;

        let timeSlot = TIME_SLOT_DEFAULT;

        if (rawDate) {
          const dt = new Date(rawDate);
          if (!isNaN(dt.getTime())) {
            const hh = String(dt.getHours()).padStart(2, "0");
            const mm = String(dt.getMinutes()).padStart(2, "0");
            const candidate = `${hh}:${mm}`;
            if (TIME_SLOT_REGEX.test(candidate)) {
              timeSlot = candidate;
            } else {
              // Fallback to default if somehow malformed after extraction
              console.warn(
                `Appointment ${appt._id}: extracted time slot '${candidate}' is invalid, using default ${TIME_SLOT_DEFAULT}`,
              );
            }
          } else {
            console.warn(
              `Appointment ${appt._id}: date is malformed or invalid, setting timeSlot to default ${TIME_SLOT_DEFAULT}`,
            );
          }
        } else {
          console.warn(
            `Appointment ${appt._id}: date is missing, setting timeSlot to default ${TIME_SLOT_DEFAULT}`,
          );
        }

        if (dryRun) {
          console.log(
            `DRYRUN: Would set appointment ${appt._id} timeSlot='${timeSlot}'`,
          );
          skipped++;
          continue;
        }

        // Idempotent update: only set if timeSlot still missing/null/empty
        const updateResult = await Appointment.updateOne(
          {
            _id: appt._id,
            $or: [
              { timeSlot: { $exists: false } },
              { timeSlot: null },
              { timeSlot: "" },
            ],
          },
          { $set: { timeSlot } },
        );

        if (updateResult.modifiedCount && updateResult.modifiedCount > 0) {
          updated++;
        } else {
          // Possibly updated by another process; count as skipped
          skipped++;
        }
      } catch (err) {
        errors++;
        console.error(
          `Error processing appointment ${appt._id}:`,
          err.message || err,
        );
      }
    }

    console.log("Migration complete.");
    console.log(`Processed: ${processed}`);
    console.log(`Updated:   ${updated}`);
    console.log(`Skipped:   ${skipped}`);
    console.log(`Errors:    ${errors}`);
  } catch (err) {
    console.error("Migration failed:", err);
    try {
    } catch (e) {
      /* ignore */
    }
    process.exit(1);
  }
};

// Allow running with: node migrate_timeSlot_from_date.js [--dry-run]
const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run");

// ES Module: Check if script is being run directly (not imported)
if (process.argv[1] === __filename) {
  (async () => {
    await connectDB();
    await migrate({ dryRun });
    await mongoose.disconnect();
    process.exit(0);
  })();
}

export default migrate;
