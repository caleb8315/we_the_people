const DEFAULT_SITE_URL = 'https://crosscheck.news';

/**
 * Centralized launch-surface metadata. These defaults keep legal/privacy pages,
 * footer links, and security.txt aligned until deploy-specific values are
 * supplied via environment variables.
 */
export const siteConfig = {
  name: 'Crosscheck',
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || DEFAULT_SITE_URL,
  supportEmail: process.env.SUPPORT_EMAIL || 'hello@crosscheck.news',
  privacyEmail: process.env.PRIVACY_EMAIL || 'privacy@crosscheck.news',
  securityEmail: process.env.SECURITY_EMAIL || 'security@crosscheck.news',
  legalEmail: process.env.LEGAL_EMAIL || 'legal@crosscheck.news',
  // Optional "support the project" links. Empty string = hide the button.
  // These are plain outbound links (GitHub Sponsors / Stripe Payment Link /
  // Open Collective). No billing backend is wired.
  sponsorUrl: process.env.NEXT_PUBLIC_SPONSOR_URL || '',
  donateUrl: process.env.NEXT_PUBLIC_DONATE_URL || '',
};
