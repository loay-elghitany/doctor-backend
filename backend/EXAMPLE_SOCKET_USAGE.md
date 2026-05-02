# Socket.io Usage Examples for Controllers

## Import Event Emitters

```javascript
import {
  emitNewPatientRegistered,
  emitNewAppointmentToStaff,
  emitAppointmentConfirmationToPatient,
} from "../utils/socketManager.js";
```

## Event A: New Patient Registration

```javascript
// In patientController.js - when registering a new patient
export const registerPatient = async (req, res) => {
  try {
    // ... existing registration logic ...
    const patient = await Patient.create({ ... });
    
    // Emit real-time notification to clinic staff
    emitNewPatientRegistered(req.doctor.clinicSlug);
    
    res.status(201).json({ success: true, data: patient });
  } catch (error) {
    // ... error handling ...
  }
};
```

## Event B: New Appointment Booking

```javascript
// In appointmentController.js - when creating an appointment
export const createAppointment = async (req, res) => {
  try {
    // ... existing appointment logic ...
    const appointment = await Appointment.create({ ... });
    
    const { doctor, patient, date } = appointment;
    const formattedDate = new Date(date).toLocaleDateString("ar-SA");
    
    // Emit to staff (doctors/secretaries of the clinic)
    emitNewAppointmentToStaff(
      doctor.clinicSlug,
      patient.name,
      formattedDate
    );
    
    // Emit confirmation to the patient
    emitAppointmentConfirmationToPatient(patient._id.toString());
    
    res.status(201).json({ success: true, data: appointment });
  } catch (error) {
    // ... error handling ...
  }
};
```

## Quick Reference

| Event | Function | Target Room | Message |
|-------|----------|-------------|---------|
| A | `emitNewPatientRegistered(clinicSlug)` | `clinic_X_staff` | "تم تسجيل مريض جديد" |
| B | `emitNewAppointmentToStaff(clinicSlug, patientName, date)` | `clinic_X_staff` | "المريض [name] يريد حجز موعد يوم [date]" |
| B | `emitAppointmentConfirmationToPatient(patientId)` | `patient_X` | "تم حجز الموعد بنجاح، الدكتور في انتظارك" |
