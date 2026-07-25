import { api } from '../../../lib/api';

function dataOf(response) {
  return response.data.data;
}

export async function getPermissions({ search, module } = {}, signal) {
  return dataOf(
    await api.get('/admin/permissions', {
      signal,
      params: {
        search: search || undefined,
        module: module || undefined,
      },
    }),
  );
}
