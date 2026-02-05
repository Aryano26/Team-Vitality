import axios from "axios";

const API_BASE = "http://localhost:3000/api/v1";

/**
 * Get auth headers for API requests.
 * Reads token from localStorage.
 */
export const getAuthHeaders = () => {
  const auth = localStorage.getItem("auth");
  const token = auth ? JSON.parse(auth) : null;
  return {
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
    },
  };
};

export const api = {
  get: (url) => axios.get(`${API_BASE}${url}`, getAuthHeaders()),
  post: (url, data) => axios.post(`${API_BASE}${url}`, data, getAuthHeaders()),
  postForm: (url, formData) =>
    axios.post(`${API_BASE}${url}`, formData, getAuthHeaders()),
  put: (url, data) => axios.put(`${API_BASE}${url}`, data, getAuthHeaders()),
  delete: (url) => axios.delete(`${API_BASE}${url}`, getAuthHeaders()),
};

export default api;
