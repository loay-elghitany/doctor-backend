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
    console.log("doctor token", token);

    const patientId = "69a18156fdd8dc654fd1c197";
    const resp = await axios.get(
      `http://localhost:5000/api/doctor/patients/${patientId}/timeline`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    console.log("doctor timeline", resp.data.data.slice(0, 5));

    // download file using doctor endpoint
    const storedName = "ab981d97-f4e0-438a-aeaa-a80cf63ff20e.pdf";
    const dl = await axios.get(
      `http://localhost:5000/api/medical-files/download/doctor/${storedName}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "arraybuffer",
      },
    );
    console.log(
      "doctor download status",
      dl.status,
      "len",
      dl.headers["content-length"],
    );
  } catch (err) {
    console.error(err.response ? err.response.data : err);
  }
}

main();
