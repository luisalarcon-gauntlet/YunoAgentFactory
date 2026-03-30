const AUTH_KEY = "yuno_auth";

export function getCredentials(): string | null {
  return sessionStorage.getItem(AUTH_KEY);
}

export function setCredentials(username: string, password: string): void {
  sessionStorage.setItem(AUTH_KEY, btoa(`${username}:${password}`));
}

export function clearCredentials(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function isAuthenticated(): boolean {
  return sessionStorage.getItem(AUTH_KEY) !== null;
}
