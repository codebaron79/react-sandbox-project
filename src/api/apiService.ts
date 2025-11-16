import axios, { AxiosInstance, AxiosRequestConfig } from "axios"
import qs from "qs"

// Khai báo các kiểu dữ liệu sử dụng cho API

export interface ApiConfig {
    endpoint: string // URL của API
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" // Phương thức HTTP
    timeout?: number // Thời gian chờ tối đa cho request
    headers?: Record<string, string> // Header gửi kèm request
    retryOnAuthFailure?: boolean // Có tự động retry khi auth thất bại hay không
    requireAuth?: boolean // API này có cần token hay không
}

export interface Payload { [key: string]: any } // Dữ liệu gửi lên body
export interface PathParameter { [key: string]: string | number | boolean | null | undefined } // Path params trong URL
export interface QueryParameter { [key: string]: any } // Query params trong URL

// Lớp ApiError chuẩn hóa thông tin lỗi từ API
export class ApiError extends Error {
    status?: number // HTTP status code trả về từ server
    data?: any // Dữ liệu phản hồi từ server
    code?: string // Mã lỗi riêng của API nếu có

    constructor(message: string, status?: number, data?: any, code?: string) {
        super(message) // Gọi constructor của Error
        this.name = "ApiError" // Đặt tên lỗi để dễ phân biệt
        this.status = status
        this.data = data
        this.code = code
    }
}

// Tạo instance Axios mặc định
const axiosInstance: AxiosInstance = axios.create({
    baseURL: import.meta.env.VITE_API_BASE_URL || "", // URL cơ bản của API
    timeout: 10000, // Thời gian chờ mặc định
    headers: { "Content-Type": "application/json" } // Header mặc định
})

// Request interceptor: tự động thêm token nếu API yêu cầu
axiosInstance.interceptors.request.use(
    (config: any) => {
        // Lấy access token từ localStorage
        const token = localStorage.getItem("access_token")

        // Nếu API cần xác thực và token tồn tại, thêm header Authorization
        if (config.requireAuth && token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`
        }

        // Trả lại config để axios tiếp tục gửi request
        return config
    },
    (error) => Promise.reject(error) // Nếu có lỗi khi tạo request, reject luôn
)

// Biến và hàng đợi để quản lý refresh token
let isRefreshing = false // Biến kiểm tra đang refresh token hay không
let failedQueue: Array<{
    resolve: (token: any) => void
    reject: (error?: any) => void
}> = []// Hàng đợi các request chờ token mới

// Hàm xử lý hàng đợi sau khi refresh token xong
const processQueue = (error: any, token: string | null) => {
    // Duyệt qua tất cả request đang chờ
    for (let i = 0; i < failedQueue.length; i++) {
        const request = failedQueue[i]
        if (error) {
            // Nếu refresh thất bại, reject tất cả request trong queue
            request.reject(error)
        } else if (token) {
            // Nếu refresh thành công, resolve các request với token mới
            request.resolve(token)
        }
    }
    // Xóa queue sau khi xử lý xong để tránh rác bộ nhớ
    failedQueue = []
}

// Hàm chuyển người dùng về trang login nếu token không hợp lệ
const redirectToLogin = () => {
    if (window.location.pathname !== "/login") {
        window.location.href = "/login"
    }
}

// Response interceptor: xử lý lỗi, refresh token nếu cần
axiosInstance.interceptors.response.use(
    (res) => res, // Nếu response thành công, trả về luôn
    async (error) => {
        const originalRequest: any = error.config

        // Nếu API public không yêu cầu auth, không refresh token, trả lỗi luôn
        if (!originalRequest?.requireAuth) {
            return Promise.reject(error)
        }

        // Nếu response 401 và chưa retry lần nào
        if (error.response?.status === 401 && !originalRequest._retry) {
            // Nếu đang refresh token, đẩy request vào hàng đợi chờ
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject })
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`
                        return axiosInstance(originalRequest) // Retry request sau khi có token mới
                    })
                    .catch((err) => Promise.reject(err))
            }

            // Đánh dấu request này đã retry
            originalRequest._retry = true
            isRefreshing = true

            try {
                // Lấy refresh token từ localStorage
                const refreshToken = localStorage.getItem("refresh_token")
                if (!refreshToken) throw new Error("NO_REFRESH_TOKEN")

                // Gọi API refresh token
                const res = await axios.post("/api/auth/refresh", { refreshToken })
                const { access_token, refresh_token } = res.data

                // Lưu token mới vào localStorage
                localStorage.setItem("access_token", access_token)
                if (refresh_token) localStorage.setItem("refresh_token", refresh_token)

                // Cập nhật header mặc định cho các request sau
                axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${access_token}`

                // Xử lý tất cả request đang chờ trong queue
                processQueue(null, access_token)

                // Retry lại request ban đầu với token mới
                originalRequest.headers.Authorization = `Bearer ${access_token}`
                return axiosInstance(originalRequest)

            } catch (refreshError) {
                // Nếu refresh thất bại, reject tất cả request và redirect login
                processQueue(refreshError, null)
                localStorage.removeItem("access_token")
                localStorage.removeItem("refresh_token")
                redirectToLogin()
                return Promise.reject(refreshError)

            } finally {
                isRefreshing = false // Reset biến refresh
            }
        }

        // Nếu lỗi không phải 401 hoặc đã retry rồi, reject luôn
        return Promise.reject(error)
    }
)

// Hàm gọi API chung
interface CallApiOptions {
    signal?: AbortSignal // Dùng để hủy request nếu cần
    retryOnAuthFailure?: boolean // Có retry nếu auth thất bại
}

export const callAPI = async <T = any>(
    apiConfig: ApiConfig,
    payload?: Payload,
    pathParams?: PathParameter,
    queryParams?: QueryParameter,
    options?: CallApiOptions
): Promise<T> => {
    // Tạo abort controller nếu người dùng không cung cấp sẵn signal
    const controller = options?.signal ? null : new AbortController()
    const signal = options?.signal ?? controller?.signal

    try {
        // Xử lý path params: thay :key trong endpoint bằng giá trị thực
        let endpoint = apiConfig.endpoint
        if (pathParams) {
            for (const [key, value] of Object.entries(pathParams)) {
                if (value != null) {
                    endpoint = endpoint.replace(
                        new RegExp(`:${key}\\b`, "g"),
                        encodeURIComponent(String(value))
                    )
                }
            }
        }

        // Xử lý query params
        let queryString = ""
        if (queryParams && Object.keys(queryParams).length > 0) {
            const filtered = Object.fromEntries(
                Object.entries(queryParams).filter(([_, v]) => v != null)
            )
            if (Object.keys(filtered).length > 0) {
                queryString = `?${qs.stringify(filtered, {
                    arrayFormat: "brackets",
                    encode: false
                })}`
            }
        }

        // Xử lý headers
        const headers = { ...apiConfig.headers }
        if (payload instanceof FormData) {
            delete headers["Content-Type"] // FormData tự động set Content-Type
        }

        // Tạo config axios
        const axiosConfig: AxiosRequestConfig = {
            method: apiConfig.method,
            url: `${endpoint}${queryString}`,
            data: payload,
            headers,
            timeout: apiConfig.timeout ?? 10000,
            signal,
            requireAuth: apiConfig.requireAuth ?? false // Đánh dấu cho request interceptor biết
        } as any

        // Gọi API và trả dữ liệu
        const res = await axiosInstance.request<T>(axiosConfig)
        return res.data

    } catch (error: any) {
        // Nếu request bị hủy
        if (error.name === "CanceledError" || error.name === "AbortError") {
            throw new ApiError("Yêu cầu đã bị hủy", undefined, null, "ABORTED")
        }

        // Nếu response từ server trả về lỗi
        if (error.response) {
            const { status, data } = error.response
            throw new ApiError(data?.message || "API Error", status, data, data?.code)
        }

        // Nếu không nhận được response (lỗi mạng)
        if (error.request) {
            throw new ApiError("Không thể kết nối đến máy chủ", undefined, null, "NETWORK_ERROR")
        }

        // Các lỗi khác do cấu hình request
        throw new ApiError("Lỗi cấu hình API", undefined, null, "SETUP_ERROR")

    } finally {
        // Nếu sử dụng controller nội bộ, tự động hủy request
        if (controller && !options?.signal) controller.abort()
    }
}

// Hàm tiện ích để tạo AbortController
export const createAbortController = () => new AbortController()

// Hàm tiện ích lấy signal từ controller
export const getSignal = (controller: AbortController) => controller.signal
