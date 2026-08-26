import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  localStorage.clear();
  document.cookie = "omnibioai_access_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  delete window.api;
  delete window.electronAPI;
  window.history.replaceState({}, "", "/");
});
