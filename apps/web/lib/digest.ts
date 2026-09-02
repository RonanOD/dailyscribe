import type { BundleableServiceId } from "@dailyscribe/core";
import { SERVICE_CATALOG } from "@/lib/service-catalog";

/** Services eligible to be folded into a digest — i.e. whichever of these a
 *  user currently has enabled get bundled. Derived from the service catalog
 *  (which already omits the paused NYT crossword). Shared between the runner
 *  (which services to look up) and the subscriptions API route.
 *
 *  Order follows the catalog, which is also the dashboard tab order and the
 *  digest cover's table-of-contents order. */
export const DIGEST_MEMBER_SERVICES: BundleableServiceId[] = SERVICE_CATALOG.map((s) => s.id);
