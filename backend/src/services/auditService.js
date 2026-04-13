import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";

export const logAction = async ({
  actorType = "System",
  actorId = null,
  action,
  resourceType = null,
  resourceId = null,
  meta = {},
}) => {
  if (!action) {
    logger.warn("auditService", "Missing audit action", {
      actorType,
      actorId,
    });
    return null;
  }

  try {
    const entry = await AuditLog.create({
      actorType,
      actorId,
      action,
      resourceType,
      resourceId,
      meta,
    });

    logger.debug("auditService", "Action logged", {
      id: entry._id,
      actorType,
      actorId,
      action,
    });
    return entry;
  } catch (error) {
    logger.error("auditService", "Failed to log action", error);
    return null;
  }
};

export const logBlockedAction = async ({
  actorType = "Doctor",
  actorId = null,
  action = "blocked_action",
  resourceType = null,
  resourceId = null,
  reason = null,
  meta = {},
}) => {
  const entry = await logAction({
    actorType,
    actorId,
    action,
    resourceType,
    resourceId,
    meta: { ...meta, reason },
  });
  if (!entry) {
    logger.error("auditService", "Failed to log blocked action");
  }
  return entry;
};

export default {
  logAction,
  logBlockedAction,
};
