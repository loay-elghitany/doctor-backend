import Doctor from "../../src/models/Doctor.js";

describe("Doctor model URL validation", () => {
  test("accepts valid URL fields", async () => {
    const doctor = await Doctor.create({
      name: "Valid URL Doctor",
      email: "doctor-valid-url@example.com",
      password: "password123",
      clinicSlug: "valid-url-doctor",
      profilePicture: "https://cdn.example.com/profile.jpg",
      clinicPhotos: [
        "https://cdn.example.com/clinic-1.jpg",
        "http://cdn.example.com/clinic-2.png",
      ],
      socialLinks: {
        facebook: "https://facebook.com/doctor",
        instagram: "https://instagram.com/doctor",
        twitter: "https://twitter.com/doctor",
      },
    });

    expect(doctor.profilePicture).toBe("https://cdn.example.com/profile.jpg");
    expect(doctor.clinicPhotos).toHaveLength(2);
    expect(doctor.socialLinks.facebook).toContain("facebook.com");
  });

  test("rejects invalid profilePicture URL", async () => {
    await expect(
      Doctor.create({
        name: "Invalid Picture URL Doctor",
        email: "doctor-invalid-picture-url@example.com",
        password: "password123",
        clinicSlug: "invalid-picture-url-doctor",
        profilePicture: "not-a-url",
      }),
    ).rejects.toThrow(/profilePicture must be a valid HTTP\/HTTPS URL/i);
  });

  test("rejects invalid clinic photo URLs", async () => {
    await expect(
      Doctor.create({
        name: "Invalid Clinic Photos Doctor",
        email: "doctor-invalid-clinic-photos@example.com",
        password: "password123",
        clinicSlug: "invalid-clinic-photos-doctor",
        clinicPhotos: ["https://cdn.example.com/ok.jpg", "ftp://invalid-photo"],
      }),
    ).rejects.toThrow(/clinicPhotos contains an invalid HTTP\/HTTPS URL/i);
  });

  test("rejects invalid social links URLs", async () => {
    await expect(
      Doctor.create({
        name: "Invalid Social URL Doctor",
        email: "doctor-invalid-social-url@example.com",
        password: "password123",
        clinicSlug: "invalid-social-url-doctor",
        socialLinks: {
          facebook: "https://facebook.com/doctor",
          instagram: "instagram-handle-only",
          twitter: "https://twitter.com/doctor",
        },
      }),
    ).rejects.toThrow(/socialLinks\.instagram must be a valid HTTP\/HTTPS URL/i);
  });
});
