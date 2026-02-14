// import logoLight from './site-logo-light.svg';
// import logoDark from './site-logo-dark.svg';

export type SiteConfig = {
  // if you are going to provide logos, you must provide both light and dark 
  // versions for proper theming support. Import them at the top of this file 
  // then add them to the config object below and provied alt text for accessibility.
  logoLight?: string;
  logoDark?: string;
  logoAlt?: string;
};

export const siteConfig: SiteConfig = {
  // logoLight,
  // logoDark,
  // logoAlt: 'Site Speicifc altText Logo',
};
