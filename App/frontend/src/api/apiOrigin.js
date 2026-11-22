// Where the backend runs. In development and tests the API is on port 4000 (Vite has no proxy).
// The Docker image builds with VITE_API_ORIGIN="" so the browser calls /api/v1 on the
// same server that serves the page (see App/docker/Dockerfile).
export const API_ORIGIN = import.meta.env.VITE_API_ORIGIN ?? "http://localhost:4000";
