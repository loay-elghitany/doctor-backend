import axios from "axios";

async function main() {
  try {
    const loginResp = await axios.post(
      "http://localhost:5000/api/doctors/login",
      {
        email: "doctor@test.com",
        password: "password123",
      },
    );
    const token = loginResp.data.data.token;

    const otherPatientId = "69a18d42067a8e50b7e44056";
    console.log("listing files for unrelated patient...");
    try {
      const listResp = await axios.get(
        `http://localhost:5000/api/medical-files/patient/${otherPatientId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      console.log("listResp", listResp.data);
    } catch (err) {
      console.error(
        "list error",
        err.response ? err.response.data : err.message,
      );
    }

    console.log("attempt download of other patient file...");
    try {
      const dl = await axios.get(
        `http://localhost:5000/api/medical-files/download/doctor/other-test.pdf`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      console.log("download unexpected success", dl.status);
    } catch (err) {
      console.error(
        "download error",
        err.response ? err.response.data : err.message,
      );
    }
  } catch (err) {
    console.error("login error", err);
  }
}

main();
