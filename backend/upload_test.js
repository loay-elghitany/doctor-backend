import fs from "fs";
import axios from "axios";
import FormData from "form-data";

async function main() {
  // login to obtain a fresh token
  const loginResp = await axios.post(
    "http://localhost:5000/api/patients/login",
    {
      email: "patient@test.com",
      password: "patientpass123",
    },
  );
  const token = loginResp.data.data.token;
  const form = new FormData();
  form.append("file", fs.createReadStream("./sample.pdf"));

  try {
    const resp = await axios.post(
      "http://localhost:5000/api/medical-files/upload",
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`,
        },
      },
    );
    console.log("upload response", resp.data);
  } catch (err) {
    console.error("upload error", err.response ? err.response.data : err);
  }
}

main();
