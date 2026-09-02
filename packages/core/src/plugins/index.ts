/** A rendered artifact ready to be delivered (e.g. a PDF attachment). */
export interface Asset {
  filename: string;
  contentType: string;
  bytes: Buffer;
}

/** Everything a plugin needs for one run. Secrets are already decrypted. */
export interface RunContext {
  userId: string;
  /** The puzzle/edition date (use UTC getters; constructed at local midnight). */
  date: Date;
  /** Service-specific config from the subscription. Plugin validates its shape. */
  config: unknown;
  /** provider -> decrypted secret value. */
  secrets: Record<string, string>;
  /** True when this run's output is a section of a digest bundle rather than
   *  a standalone send — lets a plugin skip its own "Page X of Y" footer
   *  (which would only be correct relative to its own PDF) since the digest
   *  assembly draws a single, correct page count across the whole bundle. */
  digest?: boolean;
}

/**
 * A daily service. Every plugin today renders in-process (pure TS via
 * @react-pdf/renderer); a render-heavy service could instead implement run() by
 * calling out to a worker and wrapping the returned PDF as an Asset, with no
 * change to the dispatcher/delivery code.
 */
export interface ServicePlugin {
  id: string;
  /** Human-readable name, used for email subjects and UI. */
  label: string;
  run(ctx: RunContext): Promise<Asset[]>;
}

const registry = new Map<string, ServicePlugin>();

export function registerPlugin(plugin: ServicePlugin): void {
  registry.set(plugin.id, plugin);
}

export function getPlugin(id: string): ServicePlugin | undefined {
  return registry.get(id);
}

export function listPlugins(): ServicePlugin[] {
  return [...registry.values()];
}
