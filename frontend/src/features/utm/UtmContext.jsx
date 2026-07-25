import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getUtmParams, initUtmTracking } from './utm';

const UtmContext = createContext(null);

/**
 * Provider that extracts UTM parameters from the current page URL on mount
 * and exposes them to all descendant components.
 */
export function UtmProvider({ children }) {
  const [utmParams, setUtmParams] = useState(() => {
    // Initialize synchronously on first render
    if (typeof window !== 'undefined') {
      initUtmTracking();
    }
    return getUtmParams();
  });

  // Re-run on mount (handles single-page navigations that change query params)
  useEffect(() => {
    initUtmTracking();
    setUtmParams(getUtmParams());
  }, []);

  const value = useMemo(() => ({ utmParams }), [utmParams]);

  return <UtmContext.Provider value={value}>{children}</UtmContext.Provider>;
}

/**
 * Hook to access UTM parameters in any component within UtmProvider.
 * Returns { utmParams: { utm_source, utm_medium, utm_campaign, utm_term, utm_content } }
 */
export function useUtm() {
  const value = useContext(UtmContext);
  if (!value) {
    throw new Error('useUtm must be used within a <UtmProvider>');
  }
  return value;
}

