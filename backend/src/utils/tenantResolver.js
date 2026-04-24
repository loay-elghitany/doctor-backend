const normalizeHost = (rawHost = "") =>
  String(rawHost || "")
    .trim()
    .toLowerCase()
    .split(":")[0];

const buildReservedHosts = () =>
  new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export const extractClinicSlugFromHost = (hostHeader) => {
  const host = normalizeHost(hostHeader);
  if (!host) {
    return null;
  }

  const reservedHosts = buildReservedHosts();
  if (reservedHosts.has(host)) {
    return null;
  }

  const mainDomain = normalizeHost(process.env.MAIN_DOMAIN || "");
  if (mainDomain && host.endsWith(`.${mainDomain}`)) {
    const clinicSlug = host.slice(0, -(mainDomain.length + 1));
    return clinicSlug || null;
  }

  const segments = host.split(".");
  if (segments.length > 2) {
    return segments[0] || null;
  }

  return null;
};
