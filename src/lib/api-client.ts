const API_BASE = "";

interface FetchOptions extends RequestInit {
  skipAuth?: boolean;
}

export async function apiClient<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { skipAuth = false, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (res.status === 401 && !skipAuth) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${getAccessToken()}`;
      const retryRes = await fetch(`${API_BASE}${endpoint}`, {
        ...fetchOptions,
        headers,
      });
      if (!retryRes.ok) {
        const error = await retryRes.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(error.error || "Error en la solicitud");
      }
      return retryRes.json();
    }
    clearTokens();
    window.location.href = "/login";
    throw new Error("Sesion expirada");
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Error desconocido" }));
    throw new Error(error.error || "Error en la solicitud");
  }

  return res.json();
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("accessToken");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("refreshToken");
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem("accessToken", accessToken);
  localStorage.setItem("refreshToken", refreshToken);
}

export function clearTokens() {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
}

export function setUser(user: { id: string; name: string; email: string; onboardingCompleted?: boolean }) {
  localStorage.setItem("user", JSON.stringify(user));
}

export function getUser(): { id: string; name: string; email: string; onboardingCompleted?: boolean } | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("user");
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem("accessToken", data.accessToken);
    return true;
  } catch {
    return false;
  }
}
