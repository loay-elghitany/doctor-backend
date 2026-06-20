import Doctor from "../models/Doctor.js";

/**
 * Middleware لمنع الدكتور والسكرتيرة من استخدام العمليات الحساسة لو الاشتراك منتهي
 */
export const protectSubscription = async (req, res, next) => {
  try {
    // جلب الـ doctorId سواء كان الطلب جاي من الدكتور نفسه أو السكرتيرة المربوطة بيه
    const doctorId =
      req.user.role === "secretary" ? req.user.doctorId : req.user.id;

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res
        .status(404)
        .json({ success: false, message: "حساب الطبيب غير موجود" });
    }

    // 1. التحقق من القفل اليدوي العام للأدمن
    if (!doctor.isActive) {
      return res.status(403).json({
        success: false,
        message:
          "تم إيقاف حساب العيادة مؤقتاً من قبل الإدارة. يرجى مراجعة الدعم الفني.",
      });
    }

    // 2. 🌟 التحقق التلقائي من العداد التنازلي للاشتراك
    if (
      doctor.subscriptionExpiresAt &&
      new Date() > new Date(doctor.subscriptionExpiresAt)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "انتهت صلاحية الاشتراك الحالي للعيادة. يرجى التجديد عبر فودافون كاش لتفعيل الخدمات.",
        isExpired: true,
      });
    }

    next();
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "خطأ في التحقق من صلاحية الحساب" });
  }
};
