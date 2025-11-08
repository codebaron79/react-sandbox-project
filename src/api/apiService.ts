import axios from "axios";
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

// ========================
// Types
// ========================
export interface ApiConfig {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  timeout?: number;
  headers?: Record<string, string>;
  requireAuth?: boolean;
  retryOnAuthFailure?: boolean;
}

export interface Payload {
  [key: string]: string | number | boolean | null | undefined;
}

export interface PathParameter {
  [key: string]: string | number | boolean | null | undefined;
}

export interface QueryParameter {
  [key: string]: string | number | boolean | null | undefined;
}

// ========================
// Extend AxiosRequestConfig để dùng custom field
// ========================
interface CustomAxiosRequestConfig extends AxiosRequestConfig {
  requireAuth?: boolean;
  _retry?: boolean;
}

// ========================
// Axios instance
// ========================
const axiosInstance: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// ========================
// Refresh token queue
// ========================
let isRefreshing = false;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (err: any) => void;
}[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  failedQueue = [];
};

// ========================
// Request interceptor
// ========================
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// ========================
// Response interceptor
// ========================
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as CustomAxiosRequestConfig;

    if (
      error.response?.status === 401 &&
      originalRequest?.requireAuth &&
      !originalRequest._retry
    ) {
      if (!isRefreshing) {
        isRefreshing = true;
        const refreshToken = localStorage.getItem("refresh_token");

        if (!refreshToken) {
          isRefreshing = false;
          return Promise.reject(error);
        }

        try {
          const refreshResponse = await axios.post(
            import.meta.env.VITE_REFRESH_ENDPOINT || "",
            { refreshToken },
            { baseURL: import.meta.env.VITE_API_BASE_URL }
          );

          const newToken = refreshResponse.data?.accessToken;
          if (!newToken) throw new Error("Refresh token response invalid");

          localStorage.setItem("access_token", newToken);
          axiosInstance.defaults.headers["Authorization"] = `Bearer ${newToken}`;

          isRefreshing = false;
          processQueue(null, newToken);
        } catch (err) {
          isRefreshing = false;
          processQueue(err, null);
          return Promise.reject(err);
        }
      }

      return new Promise((resolve, reject) => {
        failedQueue.push({
          resolve: (token: string) => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers["Authorization"] = `Bearer ${token}`;
            originalRequest._retry = true;
            resolve(axiosInstance(originalRequest));
          },
          reject: (err: any) => reject(err),
        });
      });
    }

    return Promise.reject(error);
  }
);

// ========================
// Generic callAPI function
// ========================
export const callAPI = async <T = any>(
  apiConfig: ApiConfig,
  payload?: Payload,
  pathParams?: PathParameter,
  queryParams?: QueryParameter
): Promise<T> => {
  let { endpoint } = apiConfig;

  // ---- Replace path params ----
  if (pathParams) {
    Object.entries(pathParams).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        throw new Error(`Missing path param: ${key}`);
      }
      endpoint = endpoint.replace(`:${key}`, String(value));
    });
  }

  // ---- Query params ----
  const finalQuery = new URLSearchParams();
  if (queryParams) {
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        finalQuery.append(key, String(value));
      }
    });
  }

  const finalUrl =
    finalQuery.toString().length > 0
      ? `${endpoint}?${finalQuery.toString()}`
      : endpoint;

  // ---- Axios config ----
  const axiosConfig: CustomAxiosRequestConfig = {
    url: finalUrl,
    method: apiConfig.method,
    timeout: apiConfig.timeout ?? 10000,
    headers: { ...(apiConfig.headers || {}) },
    requireAuth: apiConfig.requireAuth,
    _retry: false,
  };

  // ---- Payload ----
  if (apiConfig.method !== "GET" && payload) {
    axiosConfig.data = payload;
  } else if (apiConfig.method === "GET" && payload) {
    axiosConfig.params = payload;
  }

  const response: AxiosResponse<T> = await axiosInstance.request(axiosConfig);
  return response.data;
};
