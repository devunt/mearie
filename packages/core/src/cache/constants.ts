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

/**
 * Special key used to carry merged variable context (fragment args + operation variables)
 * on fragment references. Used by readFragment to resolve variable-dependent field keys.
 * @internal
 */
export const FragmentVarsKey = '__fragmentVars' as const;
