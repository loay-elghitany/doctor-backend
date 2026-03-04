import AuditLog from "../models/AuditLog.js";
import { debugLog, debugError } from "../utils/debug.js";

export const logBlockedAction = async ({
  actorType = "Doctor",
  actorId = null,
  action = "blocked_action",
  resourceType = null,
  resourceId = null,
  reason = null,
  meta = {},
}) => {
  try {
    const entry = await AuditLog.create({
      actorType,
      actorId,
      action,
      resourceType,
      resourceId,
      reason,
      meta,
    });

    debugLog("auditService", "Blocked action logged", {
      id: entry._id,
      actorId,
      action,
    });
    return entry;
  } catch (error) {
    debugError("auditService", "Failed to log blocked action", error);
    // don't throw - auditing should not block main flow
    return null;
  }
};

export default {
  logBlockedAction,
};
