import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import assert from "assert";

async function main() {
  console.log("Running download fix verification test...");

  let patientToken;
  let doctorToken;
  let fileData;

  // 1. Login as patient
  try {
    const loginResp = await axios.post(
      "http://localhost:5000/api/patients/login",
      {
        email: "patient@test.com",
        password: "patientpass123",
      },
    );
    patientToken = loginResp.data.data.token;
    console.log("✓ Logged in as patient");
  } catch (err) {
    console.error("❌ Failed to log in as patient.", err.response ? err.response.data : err.message);
    process.exit(1);
  }

  // 2. Upload a file as the patient
  try {
    const form = new FormData();
    form.append("file", fs.createReadStream("./backend/sample.txt"));
    const resp = await axios.post(
      "http://localhost:5000/api/medical-files/upload",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${patientToken}`,
        },
      },
    );
    fileData = resp.data.data;
    console.log("✓ Uploaded test file. StoredName:", fileData.storedName);
  } catch (err) {
    console.error("❌ Failed to upload file.", err.response ? err.response.data : err.message);
    process.exit(1);
  }

  // 3. Login as doctor
  try {
    const loginResp = await axios.post(
      "http://localhost:5000/api/doctors/login",
      {
        email: "doctor@test.com",
        password: "password123",
      },
    );
    doctorToken = loginResp.data.data.token;
    console.log("✓ Logged in as doctor");
  } catch (err) {
    console.error("❌ Failed to log in as doctor.", err.response ? err.response.data : err.message);
    // Cleanup uploaded file before exiting
    await cleanup(fileData._id, patientToken);
    process.exit(1);
  }

  const fullStoredName = fileData.storedName;
  const fileIdentifier = fullStoredName.split("/").pop();

  // 4. Test download with FULL storedName
  try {
    const downloadResp = await axios.get(
      `http://localhost:5000/api/medical-files/download/doctor/${fullStoredName}`,
      { headers: { Authorization: `Bearer ${doctorToken}` } },
    );
    assert.strictEqual(downloadResp.status, 200, "Expected status 200 for full path download");
    console.log("✓ Doctor successfully downloaded file using FULL path.");
  } catch (err) {
    console.error("❌ Doctor FAILED to download file using FULL path.", err.response ? err.response.data : err.message);
  }

  // 5. Test download with UUID only
  try {
    const downloadResp = await axios.get(
      `http://localhost:5000/api/medical-files/download/doctor/${fileIdentifier}`,
      { headers: { Authorization: `Bearer ${doctorToken}` } },
    );
    assert.strictEqual(downloadResp.status, 200, "Expected status 200 for identifier download");
    console.log("✓ Doctor successfully downloaded file using IDENTIFIER only.");
  } catch (err) {
    console.error("❌ Doctor FAILED to download file using IDENTIFIER only.", err.response ? err.response.data : err.message);
  }
  
  // 6. Cleanup
  await cleanup(fileData._id, patientToken);

  console.log("
Test finished.");
}

async function cleanup(fileId, token) {
    if (!fileId) return;
    try {
        await axios.delete(`http://localhost:5000/api/medical-files/${fileId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log("✓ Cleaned up test file.");
    } catch (err) {
        console.error("⚠️  Failed to cleanup test file.", err.response ? err.response.data : err.message);
    }
}

main().catch(err => {
    console.error("An unexpected error occurred during test execution:", err);
});
