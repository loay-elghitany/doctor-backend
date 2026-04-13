const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "__tmp_logger_content.js");
const dest = path.join(__dirname, "src", "utils", "logger.js");
fs.copyFileSync(src, dest);

const patientPath = path.join(
  __dirname,
  "src",
  "controllers",
  "patientController.js",
);
let text = fs.readFileSync(patientPath, "utf8");
text = text.replace(
  '    logger.debug("registerPatient: req.body", req.body);',
  '    logger.debug("registerPatient", { clinicSlug, email, hasPassword: !!password, hasUser: !!req.user, userRole: req.user?.role });',
);
text = text.replace(
  '    logger.debug("registerPatient: req.user", req.user);',
  "",
);
fs.writeFileSync(patientPath, text, "utf8");
console.log("done");
