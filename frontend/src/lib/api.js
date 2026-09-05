import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API,
  withCredentials: true,
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 428) window.dispatchEvent(new CustomEvent("sn-creds-required"));
    return Promise.reject(err);
  }
);

export const authApi = {
  me: () => api.get("/auth/me").then((r) => r.data),
  session: (session_id) => api.post("/auth/session", { session_id }).then((r) => r.data),
  logout: () => api.post("/auth/logout").then((r) => r.data),
};
