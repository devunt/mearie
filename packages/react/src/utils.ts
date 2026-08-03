import { useEffect, useLayoutEffect } from 'react';

export const useIsomorphicLayoutEffect = globalThis.window === undefined ? useEffect : useLayoutEffect;
