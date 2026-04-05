
export const BASE_URL = "http://100.106.246.108:4000";

const withUser = (payload = {}) => {
  const raw =
    typeof window !== "undefined" ? sessionStorage.getItem("rv_user") : null;
  const user = raw ? JSON.parse(raw) : null;
  return { ...payload, userId: payload.userId || user?.id };
};

export const vaultApi = {
  // 1. Fetching Data
  loadVault: async (folderId, userId) => {
    const response = await fetch(`${BASE_URL}/load-vault`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, userId }),
    });
    if (!response.ok) throw new Error("Failed to load vault");
    return response.json();
  },

  createFolder: async (name, parentId, userId) => {
    const response = await fetch(`${BASE_URL}/create-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId, userId }),
    });
    if (!response.ok) throw new Error("Failed to create folder");
    return response.json();
  },

  compress: async (payload) => {
    return fetch(`${BASE_URL}/compress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  extract: async (payload) => {
    return fetch(`${BASE_URL}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  delete: async (payload) => {
    return fetch(`${BASE_URL}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withUser(payload)),
    });
  },

  rename: async (payload) => {
    return fetch(`${BASE_URL}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withUser(payload)),
    });
  },
  copy: async (payload) => {
    return fetch(`${BASE_URL}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withUser(payload)),
    });
  },

  move: async (payload) => {
    return fetch(`${BASE_URL}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withUser(payload)),
    });
  },

  extractText: async (filename) => {
    const response = await fetch(`${BASE_URL}/ai/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename }),
    });
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "OCR failed");
    }
    return response.json();
  },

  createDocument: async (payload) => {
    return fetch(`${BASE_URL}/create-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withUser(payload)),
    });
  },

  searchVault: async (query) => {
    const response = await fetch(
      `${BASE_URL}/search?q=${encodeURIComponent(query)}`,
    );
    if (!response.ok) throw new Error("Search failed");
    return response.json();
  },

  register: async (username, password) => {
    const response = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Registration failed");
    return data;
  },

  login: async (username, password) => {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Login failed");
    return data;
  },

  bulkDelete: async (itemIds, userId) => {
    const response = await fetch(`${BASE_URL}/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withUser({ itemIds, userId })),
    });
    if (!response.ok) throw new Error("Bulk delete failed");
    return response.json();
  },

  bulkMove: async (itemIds, destinationFolderId, userId) => {
    const response = await fetch(`${BASE_URL}/bulk-move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(withUser({ itemIds, destinationFolderId, userId })),
    });
    if (!response.ok) throw new Error("Bulk move failed");
    return response.json();
  },

  getAllFolders: async () => {
    const response = await fetch(`${BASE_URL}/folders`);
    const data = await response.json();
    return data.folders;
  },

  imagesToPdf: async (filenames, outputName, uploaderId, folderId) => {
    const mediaId = "media_" + Date.now();
    const response = await fetch(`${BASE_URL}/tools/images-to-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filenames,
        outputName,
        mediaId,
        uploaderId,
        folderId,
      }),
    });
    if (!response.ok) throw new Error("PDF creation failed");
    return response.json();
  },

  pdfToImages: async (filename, uploaderId, folderId) => {
    const response = await fetch(`${BASE_URL}/tools/pdf-to-images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, uploaderId, folderId }),
    });
    if (!response.ok) throw new Error("Image extraction failed");
    return response.json();
  },

  shareItem: async (itemId, itemType, sharedBy, targetUsername = null) => {
    const response = await fetch(`${BASE_URL}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, itemType, sharedBy, targetUsername }),
    });
    return response.json();
  },

  getSharedWithMe: async (username) => {
    const response = await fetch(`${BASE_URL}/shared-with-me/${username}`);
    if (!response.ok) throw new Error("Failed to load shared items");
    return response.json();
  },
};
