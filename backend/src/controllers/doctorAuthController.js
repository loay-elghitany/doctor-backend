import bcrypt from "bcryptjs";
import Doctor from "../models/Doctor.js";

export const updateDoctorCredentials = async (req, res) => {
  try {
    const doctorId = req.user?._id;
    if (!doctorId) {
      return res.status(401).json({
        message: "غير مصرح بالدخول",
      });
    }

    const { email, currentPassword, newPassword } = req.body || {};
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : undefined;
    const normalizedNewPassword =
      typeof newPassword === "string" ? newPassword.trim() : "";

    const doctor = await Doctor.findById(doctorId).select("+password");
    if (!doctor) {
      return res.status(404).json({
        message: "المستخدم غير موجود",
      });
    }

    let hasUpdates = false;

    if (
      normalizedEmail &&
      normalizedEmail.length > 0 &&
      normalizedEmail !== doctor.email.toLowerCase()
    ) {
      const existingDoctor = await Doctor.findOne({
        email: normalizedEmail,
        _id: { $ne: doctor._id },
      });

      if (existingDoctor) {
        return res.status(400).json({
          message: "هذا البريد الإلكتروني مستخدم بالفعل من قبل شخص آخر",
        });
      }

      doctor.email = normalizedEmail;
      hasUpdates = true;
    }

    if (normalizedNewPassword) {
      if (!currentPassword || typeof currentPassword !== "string") {
        return res.status(400).json({
          message: "كلمة المرور الحالية مطلوبة لتغيير كلمة المرور",
        });
      }

      const isCurrentPasswordValid = await bcrypt.compare(
        currentPassword,
        doctor.password,
      );

      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          message: "كلمة المرور الحالية التي أدخلتها غير صحيحة",
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(normalizedNewPassword, salt);
      doctor.password = hashedPassword;
      hasUpdates = true;
    }

    if (!hasUpdates) {
      return res.status(400).json({
        message: "لم يتم تقديم أي تغييرات",
      });
    }

    await doctor.save();

    return res.status(200).json({
      message: "تم تحديث بيانات حسابك بنجاح ✅",
    });
  } catch (error) {
    return res.status(500).json({
      message: "حدث خطأ في الخادم. حاول مرة أخرى لاحقًا.",
    });
  }
};
