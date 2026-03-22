import axios from "axios";

async function main() {
  try {
    const loginResp = await axios.post(
      "http://localhost:5000/api/patients/login",
      {
        email: "other@test.com",
        password: "otherpass",
      },
    );
    const token = loginResp.data.data.token;

    console.log("listing own files...");
    try {
      const resp = await axios.get(
        "http://localhost:5000/api/medical-files/my",
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      console.log("own files", resp.data);
    } catch (err) {
      console.error("own list err", err.response ? err.response.data : err);
    }

    console.log("attempt to download another patient file...");
    try {
      const dl = await axios.get(
        "http://localhost:5000/api/medical-files/download/patient/ab981d97-f4e0-438a-aeaa-a80cf63ff20e.pdf",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      console.log("unexpected download", dl.status);
    } catch (err) {
      console.error(
        "download err",
        err.response ? err.response.data : err.message,
      );
    }
  } catch (err) {
    console.error("login error", err);
  }
}

main();
