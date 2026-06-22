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
}

/**
 * A daily service. NYT renders in-process; future render-heavy services (CBC, HA)
 * will implement run() by POSTing to a Python renderer worker and wrapping the
 * returned PDF as an Asset — the dispatcher/delivery code never changes.
 */
export interface ServicePlugin {
  id: string;
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
