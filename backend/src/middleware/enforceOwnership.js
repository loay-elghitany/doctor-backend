// Middleware to enforce tenant ownership on resources

const enforceOwnership = (fetchResource) => {
  return async (req, res, next) => {
    try {
      const resource = await fetchResource(req);

      if (!resource) {
        return res.status(404).json({ message: "Not found" });
      }

      if (resource.doctorId.toString() !== req.tenantId.toString()) {
        return res.status(403).json({ message: "Forbidden" });
      }

      req.resource = resource;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export default enforceOwnership;

// Example usage:
// import enforceOwnership from "../middleware/enforceOwnership.js";
// router.delete(
//   "/appointments/:id",
//   enforceOwnership(async (req) => Appointment.findById(req.params.id)),
//   appointmentController.cancelAppointment,
// );
