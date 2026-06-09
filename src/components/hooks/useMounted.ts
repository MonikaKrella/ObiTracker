import { useSyncExternalStore } from "react";

// Subscribe is a no-op: mounted state never changes after the initial render.
const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * Returns `true` after the component has hydrated on the client, `false`
 * during SSR and the initial client render.
 *
 * Use this instead of the `useState(false) + useEffect(() => setMounted(true))`
 * pattern to avoid triggering the react-compiler/react-compiler lint rule
 * ("Calling setState synchronously within an effect can trigger cascading
 * renders"). The `useSyncExternalStore` form integrates with React's rendering
 * lifecycle without an extra state update cycle.
 *
 * @example
 * ```tsx
 * const mounted = useMounted();
 * if (!mounted) return <Skeleton />;
 * return <RadixDropdown />;
 * ```
 */
export function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
}
