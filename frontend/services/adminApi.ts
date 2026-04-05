import { BASE_URL } from './vaultApi';

export const adminApi = {
  getAllUsers: async () => {
    const res = await fetch(`${BASE_URL}/admin/users`);
    if (!res.ok) throw new Error('Failed to fetch users');
    return res.json();
  },

  getAllFiles: async () => {
    const res = await fetch(`${BASE_URL}/admin/files`);
    if (!res.ok) throw new Error('Failed to fetch files');
    return res.json();
  },

  getUserFiles: async (userId: string) => {
    const res = await fetch(`${BASE_URL}/admin/users/${userId}/files`);
    if (!res.ok) throw new Error('Failed to fetch user files');
    return res.json();
  },

  getStats: async () => {
    const res = await fetch(`${BASE_URL}/admin/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  getAllShares: async () => {
    const res = await fetch(`${BASE_URL}/admin/shares`);
    if (!res.ok) throw new Error('Failed to fetch shares');
    return res.json();
  },

  deleteUser: async (userId: string) => {
    const res = await fetch(`${BASE_URL}/admin/users/${userId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete user');
    return res.json();
  },

  deleteFile: async (fileId: string, filename: string) => {
    console.log('deleteFile called with:', fileId, filename);
    const res = await fetch(`${BASE_URL}/admin/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename }),
    });
    if (!res.ok) {
      const error = await res.text();
      console.error('Delete error:', error);
      throw new Error(error || 'Failed to delete file');
    }
    return res.json();
  },

  revokeShare: async (shareId: string) => {
    const res = await fetch(`${BASE_URL}/admin/shares/${shareId}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to revoke share');
    return res.json();
  },
};