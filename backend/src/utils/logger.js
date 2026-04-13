import util from "util";

const isProduction = process.env.NODE_ENV === "production";
const MAX_SANITIZE_DEPTH = 4;
const SENSITIVE_KEYS = new Set([
  "password",
  "pass",
  "pwd",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "auth",
  "jwt",
  "secret",
  "req",
  "res",
  "user",
  "patient",
  "doctor",
  "secretary",
]);

const isPlainObject = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof Error);

const sanitizeValue = (value, key, depth = 0) => {
  if (depth > MAX_SANITIZE_DEPTH) {
    return "[MAX_DEPTH_REACHED]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    if (key && SENSITIVE_KEYS.has(key.toLowerCase())) {
      return "[REDACTED]";
    }
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: isProduction ? undefined : value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.keys(value).reduce((acc, childKey) => {
      const lowerKey = childKey.toLowerCase();
      const childValue = value[childKey];

      if (SENSITIVE_KEYS.has(lowerKey)) {
        acc[childKey] = "[REDACTED]";
      } else {
        acc[childKey] = sanitizeValue(childValue, childKey, depth + 1);
      }

      return acc;
    }, {});
  }

  return String(value);
};

const buildLogEntry = (level, module, message, metadata) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
  };

  if (metadata !== undefined && metadata !== null) {
    entry.metadata = sanitizeValue(metadata);
  }

  return entry;
};

const formatForConsole = (entry) => {
  const { timestamp, level, module, message, metadata } = entry;
  const main = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;

  if (metadata === undefined) {
    return main;
  }

  const safeMeta = util.inspect(metadata, {
    depth: 3,
    colors: true,
    maxArrayLength: 10,
  });

  return `${main} ${safeMeta}`;
};

const writeEntry = (entry) => {
  if (isProduction) {
    const stream = entry.level === "error" ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(entry)}\n`);
    return;
  }

  if (entry.level === "error") {
    console.error(formatForConsole(entry));
  } else if (entry.level === "warn") {
    console.warn(formatForConsole(entry));
  } else {
    console.log(formatForConsole(entry));
  }
};

const normalizeLogArguments = (module, message, metadata) => {
  if (module instanceof Error) {
    return {
      module: "Internal",
      message: module.message || "Unhandled error",
      metadata: module,
    };
  }

  if (typeof module === "string" && message instanceof Error) {
    return {
      module: module || "Internal",
      message: message.message || module || "Unhandled error",
      metadata: message,
    };
  }

  if (typeof module === "string" && message === undefined) {
    return {
      module,
      message: "No message provided",
      metadata,
    };
  }

  return {
    module: module || "Internal",
    message: message || "No message provided",
    metadata,
  };
};

const ALLOWED_PROD_LEVELS = new Set(["warn", "error"]);

const log = (level, module, message, metadata) => {
  const normalized = normalizeLogArguments(module, message, metadata);

  if (!normalized.module || !normalized.message) {
    return;
  }

  if (isProduction && !ALLOWED_PROD_LEVELS.has(level)) {
    return;
  }

  const entry = buildLogEntry(
    level,
    normalized.module,
    normalized.message,
    normalized.metadata,
  );
  writeEntry(entry);
};

const logger = {
  info: (module, message, metadata) => log("info", module, message, metadata),
  warn: (module, message, metadata) => log("warn", module, message, metadata),
  error: (module, message, metadata) => log("error", module, message, metadata),
  debug: (module, message, metadata) => log("debug", module, message, metadata),
};

export default logger;
