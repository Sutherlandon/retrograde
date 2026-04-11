// import logoLight from './site-logo-light.svg';
// import logoDark from './site-logo-dark.svg';

export type SiteConfig = {
  dashboardHome: boolean;
  usernameField: string;
  // List of external_id values (from the OAuth provider) that may access the
  // admin metrics dashboard at /app/admin/dashboard. Empty = no one can access.
  adminUsers: string[];
  logoLight?: string;
  logoDark?: string;
  logoAlt?: string;
};

export const siteConfig: SiteConfig = {
  // This will make / redirect to the /app/dashboard instead of the default landing page.
  // Essntially making the dashboard the home page.  Good for when SSO will automatically
  // log users in. This will disable the logout feature.
  dashboardHome: false,

  // If you are using SSO, set the username field to whatever field in the OIDC token you want to use as the username.
  usernameField: "preferred_username",

  // Add the external_id values (as provided by your OAuth/SSO provider) for any
  // users who should be able to view the admin metrics dashboard.
  adminUsers: [],

  // if you are going to provide logos, you must provide both light and dark
  // versions for proper theming support. Import them at the top of this file
  // then add them to the config object below and provied alt text for accessibility.
  // logoLight,
  // logoDark,
  // logoAlt: 'Site Speicifc altText Logo',
};
