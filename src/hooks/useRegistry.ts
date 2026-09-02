import { useSyncExternalStore } from 'react';
import { getVersion, subscribe } from '../lib/webmcp';

/** Re-renders the caller whenever the tool registry or the activity log changes. */
export function useRegistryVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion);
}
