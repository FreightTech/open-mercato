/**
 * Integration-test metadata for the KSeF module.
 *
 * Tests in this folder only run when the `ksef` module is enabled in the
 * target app's `src/modules.ts`. Keep the identifier in sync with
 * `packages/ksef/src/modules/ksef/index.ts`.
 */
export const integrationMeta = {
  description: 'KSeF invoice CRUD + FA(3) XML generation per RodzajFaktury',
  dependsOnModules: ['ksef'],
}
