import axios from "axios";

async function main() {
  // helper to make request with optional token
  const makeReq = async (token) => {
    try {
      const resp = await axios.get(
        "http://localhost:5000/api/medical-files/download/somefile.pdf",
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      console.log("unexpected success", resp.status, resp.data);
    } catch (err) {
      if (err.response) {
        console.log(
          "legacy route status",
          token ? "with token" : "no token",
          err.response.status,
          err.response.data,
        );
      } else {
        console.error("request error", err);
      }
    }
  };

  // no token
  await makeReq(null);

  // login as patient
  const patLogin = await axios.post(
    "http://localhost:5000/api/patients/login",
    { email: "patient@test.com", password: "patientpass123" },
  );
  await makeReq(patLogin.data.data.token);

  // login as doctor
  const docLogin = await axios.post("http://localhost:5000/api/doctors/login", {
    email: "doctor@test.com",
    password: "password123",
  });
  await makeReq(docLogin.data.data.token);
}

main();
