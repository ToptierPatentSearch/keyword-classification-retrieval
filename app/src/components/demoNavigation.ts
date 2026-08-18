export type DemoNavigationSource = "landing" | "workspace";

const DEMO_NAVIGATION_SOURCE_KEY = "kcr_demo_navigation_source_v1";

export function setDemoNavigationSource(source: DemoNavigationSource): void {
  window.sessionStorage.setItem(DEMO_NAVIGATION_SOURCE_KEY, source);
}

export function getDemoNavigationSource(): DemoNavigationSource {
  return window.sessionStorage.getItem(DEMO_NAVIGATION_SOURCE_KEY) ===
    "workspace"
    ? "workspace"
    : "landing";
}

export function clearDemoNavigationSource(): void {
  window.sessionStorage.removeItem(DEMO_NAVIGATION_SOURCE_KEY);
}
