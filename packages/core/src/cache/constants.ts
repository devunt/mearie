/**
 * Special key used to mark normalized entity references in the cache.
 * When an entity is normalized, it's replaced with an object containing this key
 * with the entity key as the value.
 * @internal
 */
export const EntityLinkKey = '__ref' as const;

/**
 * Special key for storing root query fields.
 * @internal
 */
export const RootFieldKey = '__root' as const;

/**
 * Special key used to mark fragment references in entities.
 * Used for cache-agnostic fragment system.
 * @internal
 */
export const FragmentRefKey = '__fragmentRef' as const;
