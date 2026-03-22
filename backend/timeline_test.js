import axios from "axios";

async function main() {
  try {
    const loginResp = await axios.post(
      "http://localhost:5000/api/patients/login",
      {
        email: "patient@test.com",
        password: "patientpass123",
      },
    );
    const token = loginResp.data.data.token;
    console.log("got token");

    const resp = await axios.get("http://localhost:5000/api/patient/timeline", {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log("timeline", resp.data.data.slice(0, 5)); // show first few events

    // attempt to download the most recent file via patient download route
    if (resp.data.data.length === 0) {
      console.log("no timeline events for patient to find file id");
    }
    // we'll just try to download the last uploaded sample file directly
    const storedName = "ab981d97-f4e0-438a-aeaa-a80cf63ff20e.pdf";
    const dl = await axios.get(
      `http://localhost:5000/api/medical-files/download/patient/${storedName}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "arraybuffer",
      },
    );
    console.log(
      "download status",
      dl.status,
      "content-length",
      dl.headers["content-length"],
    );
  } catch (err) {
    console.error(err.response ? err.response.data : err);
  }
}

main();
