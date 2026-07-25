import { api } from '../../../lib/api';

function dataOf(response) {
  return response.data.data;
}

export async function getUsers(params = {}, signal) {
  return dataOf(await api.get('/admin/users', { signal, params: {
    search: params.search || undefined,
    status: params.status || undefined,
    roleCode: params.roleCode || undefined,
    page: params.page || 1,
    limit: params.limit || 20,
  }}));
}

export async function getUser(userId, signal) {
  return dataOf(await api.get(`/admin/users/${encodeURIComponent(userId)}`, { signal }));
}

export async function createUser(payload) {
  return dataOf(await api.post('/admin/users', payload));
}

export async function updateUser(userId, payload) {
  return dataOf(await api.patch(`/admin/users/${encodeURIComponent(userId)}`, payload));
}

export async function replaceUserRoles(userId, roleIds) {
  return dataOf(await api.put(`/admin/users/${encodeURIComponent(userId)}/roles`, { roleIds }));
}

export async function activateUser(userId) {
  return dataOf(await api.post(`/admin/users/${encodeURIComponent(userId)}/activate`, {}));
}

export async function disableUser(userId) {
  return dataOf(await api.post(`/admin/users/${encodeURIComponent(userId)}/disable`, {}));
}

export async function revokeUserSessions(userId) {
  return dataOf(await api.post(`/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {}));
}
