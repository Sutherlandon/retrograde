/**
 * Feature flags for Retrograde app
 */
export const FEATURES: { [key: string]: string[] } = {
  development: [
    "--accounts",
  ],
  production: [

  ],
};

export function feature(flag: string): boolean {
  const env = import.meta.env.VITE_NODE_ENV;
  if (!env || !(env in FEATURES)) {
    return false;
  }

  return FEATURES[env as keyof typeof FEATURES].includes(flag);
}