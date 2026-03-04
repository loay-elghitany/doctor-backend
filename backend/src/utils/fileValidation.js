import path from "path";
import mime from "mime-types";

const ALLOWED_MIMETYPES = ["image/jpeg", "image/png", "application/pdf"];
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".pdf"];

export const isSafeMime = (mimetype) => ALLOWED_MIMETYPES.includes(mimetype);

export const extensionMatchesMime = (originalName, mimetype) => {
  const ext = path.extname(originalName || "").toLowerCase();
  if (!ext) return false;
  if (!ALLOWED_EXT.includes(ext)) return false;

  const derived = mime.extension(mimetype);
  if (!derived) return false;

  // map 'jpeg' -> '.jpg' etc
  const norm = `.${derived}`;
  if (ext === ".jpeg") return mimetype === "image/jpeg";
  return ext === norm;
};

export const sanitizeFilename = (name) => {
  if (!name) return "file";
  // Remove path components and normalize spaces
  const base = path.basename(name).replace(/[^a-zA-Z0-9._\- ]/g, "_");
  return base.replace(/\s+/g, "_");
};

export default { isSafeMime, extensionMatchesMime, sanitizeFilename };
