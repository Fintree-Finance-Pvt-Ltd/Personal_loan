import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getAttributionPayload, getUtmParams, initUtmTracking } from './utm';

const UtmContext = createContext(null);

/**
 * Provider that extracts UTM and acquisition parameters from the current page URL on mount
 * and exposes them to all descendant components.
 */
export function UtmProvider({ children }) {
  const [utmParams, setUtmParams] = useState(() => {
    if (typeof window !== 'undefined') {
      initUtmTracking();
    }
    return getUtmParams();
  });

  const [attribution, setAttribution] = useState(() => {
    if (typeof window !== 'undefined') {
      initUtmTracking();
    }
    return getAttributionPayload();
  });

  // Re-run on mount (handles single-page navigations that change query params)
  useEffect(() => {
    initUtmTracking();
    setUtmParams(getUtmParams());
    setAttribution(getAttributionPayload());
  }, []);

  const value = useMemo(() => ({ utmParams, attribution }), [utmParams, attribution]);

  return <UtmContext.Provider value={value}>{children}</UtmContext.Provider>;
}

/**
 * Hook to access UTM and acquisition attribution in any component within UtmProvider.
 * Returns { utmParams, attribution }
 */
export function useUtm() {
  const value = useContext(UtmContext);
  if (!value) {
    throw new Error('useUtm must be used within a <UtmProvider>');
  }
  return value;
}
