let tokenRequest: Promise<string> | null = null;

export function getCsrfToken() {
  tokenRequest ??= fetch("/api/csrf", { method: "GET", credentials: "same-origin", cache: "no-store" })
    .then(async response => {
      if (!response.ok) throw new Error("CSRF_TOKEN_UNAVAILABLE");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("token" in body) || typeof body.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(body.token)) throw new Error("CSRF_TOKEN_INVALID");
      return body.token;
    })
    .catch(error => { tokenRequest = null; throw error; });
  return tokenRequest;
}

export function clearCsrfTokenCache() { tokenRequest = null; }
