import type { BundleableServiceId } from "@dailyscribe/core";

/** Services eligible to be folded into a digest — i.e. whichever of these a
 *  user currently has enabled get bundled. NYT crossword is excluded: its
 *  plugin is paused (per-user cookie privacy concerns). Shared between the
 *  runner (which services to look up) and the subscriptions API route. */
export const DIGEST_MEMBER_SERVICES: BundleableServiceId[] = ["cbc", "bbc", "ha-summary", "kanji"];
