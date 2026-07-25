import { api } from '../../../lib/api';

function dataOf(response) {
  return response.data.data;
}

export async function getRoles(params = {}, signal) {
  return dataOf(await api.get('/admin/roles', { signal, params: {
    search: params.search || undefined,
    status: params.status || undefined,
    isSystem: params.isSystem !== undefined ? String(params.isSystem) : undefined,
    page: params.page || 1,
    limit: params.limit || 20,
  }}));
}

export async function getRole(roleId, signal) {
  return dataOf(await api.get(`/admin/roles/${encodeURIComponent(roleId)}`, { signal }));
}

export async function createRole(payload) {
  return dataOf(await api.post('/admin/roles', payload));
}

export async function updateRole(roleId, payload) {
  return dataOf(await api.patch(`/admin/roles/${encodeURIComponent(roleId)}`, payload));
}

export async function replaceRolePermissions(roleId, permissionIds) {
  return dataOf(await api.put(`/admin/roles/${encodeURIComponent(roleId)}/permissions`, { permissionIds }));
}

export async function activateRole(roleId) {
  return dataOf(await api.post(`/admin/roles/${encodeURIComponent(roleId)}/activate`, {}));
}

export async function deactivateRole(roleId) {
  return dataOf(await api.post(`/admin/roles/${encodeURIComponent(roleId)}/deactivate`, {}));
}
