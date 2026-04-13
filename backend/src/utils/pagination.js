export const getPaginationParams = (query) => {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
  const limit =
    Number.isNaN(rawLimit) || rawLimit < 1 ? 10 : Math.min(rawLimit, 100);
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

export const buildPagination = (page, limit, totalItems) => ({
  page,
  limit,
  totalItems,
  totalPages: Math.max(1, Math.ceil(totalItems / limit)),
});
