import { api } from '../../../lib/api';
import { MOCK_LENDERS } from '../data/lenders.mock';

export const lenderMocksEnabled =
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_LENDER_MOCKS === 'true';

function wait(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function filterMockLenders({
  search,
  approvalStatus,
  operationalStatus,
  page,
  limit,
}) {
  let items = [...MOCK_LENDERS];
  const normalizedSearch = search?.trim().toLowerCase();

  if (normalizedSearch) {
    items = items.filter((lender) => {
      const searchableText = [
        lender.legalName,
        lender.displayName,
        lender.code,
        lender.supportEmail,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }

  if (approvalStatus && approvalStatus !== 'ALL') {
    items = items.filter(
      (lender) => lender.approvalStatus === approvalStatus,
    );
  }

  if (operationalStatus && operationalStatus !== 'ALL') {
    items = items.filter(
      (lender) => lender.operationalStatus === operationalStatus,
    );
  }

  items.sort(
    (first, second) =>
      new Date(second.updatedAt).getTime() -
      new Date(first.updatedAt).getTime(),
  );

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (safePage - 1) * limit;

  return {
    items: items.slice(startIndex, startIndex + limit),
    pagination: {
      page: safePage,
      limit,
      total,
      totalPages,
    },
  };
}

function dataOf(response) {
  return response.data.data;
}

export async function getLenders(
  {
    search = '',
    approvalStatus = 'ALL',
    operationalStatus = 'ALL',
    page = 1,
    limit = 9,
  },
  signal,
) {
  if (lenderMocksEnabled) {
    await wait(300);
    return filterMockLenders({
      search,
      approvalStatus,
      operationalStatus,
      page,
      limit,
    });
  }

  const response = await api.get('/admin/lenders', {
    signal,
    params: {
      search: search || undefined,
      approvalStatus:
        approvalStatus === 'ALL' ? undefined : approvalStatus,
      operationalStatus:
        operationalStatus === 'ALL' ? undefined : operationalStatus,
      page,
      limit,
    },
  });

  return dataOf(response);
}

export async function getLender(lenderId, signal) {
  return dataOf(
    await api.get(`/admin/lenders/${encodeURIComponent(lenderId)}`, { signal }),
  );
}

export async function createLender(payload) {
  return dataOf(await api.post('/admin/lenders', payload));
}

export async function updateLender(lenderId, payload) {
  return dataOf(
    await api.patch(`/admin/lenders/${encodeURIComponent(lenderId)}`, payload),
  );
}

export async function submitLender(lenderId) {
  return dataOf(
    await api.post(`/admin/lenders/${encodeURIComponent(lenderId)}/submit`, {}),
  );
}

export async function approveLender(lenderId) {
  return dataOf(
    await api.post(`/admin/lenders/${encodeURIComponent(lenderId)}/approve`, {}),
  );
}

export async function rejectLender(lenderId, reason) {
  return dataOf(
    await api.post(`/admin/lenders/${encodeURIComponent(lenderId)}/reject`, {
      reason,
    }),
  );
}

export async function activateLender(lenderId) {
  return dataOf(
    await api.post(`/admin/lenders/${encodeURIComponent(lenderId)}/activate`, {}),
  );
}

export async function deactivateLender(lenderId) {
  return dataOf(
    await api.post(`/admin/lenders/${encodeURIComponent(lenderId)}/deactivate`, {}),
  );
}
