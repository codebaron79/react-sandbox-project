import { ApiConfig } from "./apiService";

export const API_CONFIG: Record<string, Record<string, ApiConfig>> = {
  USERS: {
    LIST: {
      endpoint: "/users",
      method: "GET"
    }
  },
  POSTS: {
    LIST: {
      endpoint: "/posts",
      method: "GET"
    }
  }
};
