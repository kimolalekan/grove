import { apiClient } from "./client";

// Type definitions matching the server interfaces
export interface ApiKey {
  key: string;
  name: string;
  created: string;
  lastUsed: string | null;
  status: "active" | "revoked";
}

export interface ApiKeyCreateRequest {
  name: string;
  key: string;
  status?: "active" | "revoked";
}

export interface ApiKeyUpdateRequest {
  name?: string;
  status?: "active" | "revoked";
  lastUsed?: string;
}

export interface ApiKeySearchParams {
  search?: string;
  status?: "active" | "revoked";
  sortBy?: string;
}

export interface ApiKeysResponse {
  data: ApiKey[];
  total?: number;
}

// API Key Service
export const apiKeyService = {
  // Get all API keys with optional search/filter
  async getApiKeys(params?: ApiKeySearchParams): Promise<ApiKey[]> {
    try {
      const searchParams = new URLSearchParams();

      if (params?.search?.trim()) {
        searchParams.append("search", params.search.trim());
      }
      if (params?.status && params.status !== "all") {
        searchParams.append("status", params.status);
      }
      if (params?.sortBy) {
        // Ensure sortBy has proper format (attribute:direction)
        const sortBy = params.sortBy.includes(":")
          ? params.sortBy
          : `${params.sortBy}:desc`;
        searchParams.append("sortBy", sortBy);
      }

      const queryString = searchParams.toString();
      const endpoint = queryString ? `/apikeys?${queryString}` : "/apikeys";

      const result = await apiClient.get<ApiKey[]>(endpoint);
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error("Failed to fetch API keys:", error);
      // Return empty array as fallback
      return [];
    }
  },

  // Get a specific API key by key
  async getApiKey(key: string): Promise<ApiKey> {
    if (!key?.trim()) {
      throw new Error("API key is required");
    }

    try {
      return await apiClient.get<ApiKey>(
        `/apikeys/${encodeURIComponent(key.trim())}`,
      );
    } catch (error) {
      console.error(`Failed to fetch API key ${key}:`, error);
      throw error;
    }
  },

  // Create a new API key
  async createApiKey(data: ApiKeyCreateRequest): Promise<ApiKey> {
    if (!data.name?.trim()) {
      throw new Error("API key name is required");
    }
    if (!data.key?.trim()) {
      throw new Error("API key value is required");
    }

    try {
      const payload = {
        name: data.name.trim(),
        key: data.key.trim(),
        status: data.status || "active",
      };

      return await apiClient.post<ApiKey>("/apikeys", payload);
    } catch (error) {
      console.error("Failed to create API key:", error);
      throw error;
    }
  },

  // Update an existing API key
  async updateApiKey(key: string, data: ApiKeyUpdateRequest): Promise<ApiKey> {
    if (!key?.trim()) {
      throw new Error("API key is required");
    }

    if (!data.name?.trim() && !data.status && data.lastUsed === undefined) {
      throw new Error("At least one field must be provided for update");
    }

    try {
      const payload: ApiKeyUpdateRequest = {};

      if (data.name?.trim()) {
        payload.name = data.name.trim();
      }
      if (data.status) {
        payload.status = data.status;
      }
      if (data.lastUsed !== undefined) {
        payload.lastUsed = data.lastUsed;
      }

      return await apiClient.put<ApiKey>(
        `/apikeys/${encodeURIComponent(key.trim())}`,
        payload,
      );
    } catch (error) {
      console.error(`Failed to update API key ${key}:`, error);
      throw error;
    }
  },

  // Delete an API key
  async deleteApiKey(key: string): Promise<{ message: string }> {
    if (!key?.trim()) {
      throw new Error("API key is required");
    }

    try {
      return await apiClient.delete<{ message: string }>(
        `/apikeys/${encodeURIComponent(key.trim())}`,
      );
    } catch (error) {
      console.error(`Failed to delete API key ${key}:`, error);
      throw error;
    }
  },

  // Helper function to generate a random API key
  generateApiKey(): string {
    const prefix = "sk_";
    const randomPart =
      Math.random().toString(36).substring(2, 20) +
      Math.random().toString(36).substring(2, 15);
    return prefix + randomPart;
  },

  // Helper function to toggle API key status
  async toggleStatus(apiKey: ApiKey): Promise<ApiKey> {
    if (!apiKey?.key) {
      throw new Error("Valid API key object is required");
    }

    try {
      const newStatus = apiKey.status === "active" ? "revoked" : "active";
      const updateData: ApiKeyUpdateRequest = {
        status: newStatus,
        lastUsed:
          newStatus === "revoked"
            ? new Date().toISOString()
            : (apiKey.lastUsed ?? undefined),
      };

      return await this.updateApiKey(apiKey.key, updateData);
    } catch (error) {
      console.error(
        `Failed to toggle status for API key ${apiKey.key}:`,
        error,
      );
      throw error;
    }
  },

  // Helper function to update last used timestamp
  async updateLastUsed(key: string): Promise<ApiKey> {
    if (!key?.trim()) {
      throw new Error("API key is required");
    }

    try {
      const updateData: ApiKeyUpdateRequest = {
        lastUsed: new Date().toISOString(),
      };

      return await this.updateApiKey(key.trim(), updateData);
    } catch (error) {
      console.error(
        `Failed to update last used timestamp for API key ${key}:`,
        error,
      );
      throw error;
    }
  },

  // Helper function to validate API key format
  isValidApiKey(key: string): boolean {
    return !!(key?.trim() && key.startsWith("sk_") && key.length > 10);
  },

  // Helper function to safely copy text to clipboard
  async copyToClipboard(text: string): Promise<boolean> {
    if (!text) return false;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textArea);
        return success;
      }
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      return false;
    }
  },
};

export default apiKeyService;
