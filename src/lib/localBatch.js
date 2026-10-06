/**
 * Local-mode batch metadata helpers.
 *
 * They live outside the component file so the interface keeps fast refresh and
 * so tests can inject their own deterministic values through the `newBatchId`
 * and `now` props of `App`.
 */

/**
 * A local, unique batch id. `crypto.randomUUID` is the source, never a weak
 * generator.
 */
export function defaultBatchId() {
  return `LOCAL-${globalThis.crypto.randomUUID()}`;
}

/** The approval instant, as ISO 8601 UTC. */
export function defaultApprovedAt() {
  return new Date().toISOString();
}

/** Shape of a local batch id: the prefix plus a UUID v4. */
export const BATCH_ID_PATTERN =
  /^LOCAL-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
