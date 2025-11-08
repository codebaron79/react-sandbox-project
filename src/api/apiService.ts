import axios, { AxiosInstance } from "axios";
import qs from "qs";

export interface ApiConfig {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}

export interface Payload {
    [key: string]: any;
}

export interface PathParameter {
    [key: string]: any;
}

export interface QueryParameter {
    [key: string]: any;
}

const axiosInstance: AxiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || '',
    timeout: 10000,
    headers: {
        "Content-Type": "application/json",
    },
});

axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("access_token");
        if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

export const callAPI = async <T = any>(
    apiConfig: ApiConfig,
    payload?: Payload,
    pathParams?: PathParameter,
    queryParams?: QueryParameter
): Promise<T> => {
    try {
        let endpoint = apiConfig.endpoint;
        if (pathParams) {
            Object.keys(pathParams).forEach((key) => {
                endpoint = endpoint.replace(`:${key}`, encodeURIComponent(pathParams[key]));
            });
        }
        let queryString = "";
        if (queryParams && Object.keys(queryParams).length > 0) {
            const filteredQuery = Object.fromEntries(
                Object.entries(queryParams).filter(([_, v]) => v !== undefined)
            );
            if (Object.keys(filteredQuery).length > 0) {
                queryString = `?${qs.stringify(filteredQuery, { arrayFormat: "brackets" })}`;
            }
        }
        const axiosConfig = {
            method: apiConfig.method,
            url: `${endpoint}${queryString}`,
            data: payload || undefined,
        };
        const response = await axiosInstance.request<T>(axiosConfig);
        return response.data;
    } catch (error: any) {
        if (error.response) {
            console.error("API error:", error.response.status, error.response.data);
            throw error.response.data;
        } else {
            console.error("API network error:", error.message);
            throw error;
        }
    }
};
