// Browser-safe barrel. Any client component that imports from `@osint/core`
// only gets these browser-safe modules, so Next.js will never try to bundle
// Node built-ins (e.g. `node:crypto`) into the web client build.
//
// Node-only modules (worker / server pipelines) are deliberately NOT
// re-exported here. Import them via their explicit subpaths:
//
//   import { makeDedupeKey } from '@osint/core/dedupe';       // uses node:crypto
//   import { tryConsume }    from '@osint/core/budget';       // uses SupabaseClient
//
// Their subpath exports are declared in packages/core/package.json.
export * from './types';
export * from './verification';
export * from './contradictions';
export * from './scoring';
export * from './domains';
export * from './topics';
export * from './normalize';
export * from './evidence';
export * from './cluster';
export * from './stemmer';
export * from './entities';
export * from './synonyms';
export * from './wire-provenance';
export * from './lsh-dedup';
