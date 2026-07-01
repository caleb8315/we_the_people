import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site-config';

const routes = [
  '',
  '/about',
  '/briefings',
  '/changelog',
  '/contact',
  '/corrections',
  '/dmca',
  '/feed',
  '/login',
  '/pricing',
  '/privacy',
  '/status',
  '/terms',
  '/trust',
  '/verify',
  '/sources-licensing',
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return routes.map((route) => ({
    url: `${siteConfig.siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '' || route === '/feed' ? 'hourly' : 'weekly',
    priority: route === '' ? 1 : route === '/feed' || route === '/briefings' ? 0.9 : 0.7,
  }));
}
