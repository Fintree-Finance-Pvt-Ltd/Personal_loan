import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Custom hook to fetch city & state details for a given Indian PIN code.
 * Uses the free PostalPincode API (https://api.postalpincode.in).
 *
 * @param {string} pincode - The 6-digit PIN code to look up.
 * @param {number} delayMs - Debounce delay in ms (default 500).
 * @returns {{ city: string|null, state: string|null, isLoading: boolean, error: string|null }}
 */
export function usePincodeLookup(pincode, delayMs = 500) {
  const [city, setCity] = useState(null);
  const [state, setState] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const timerRef = useRef(null);

  const isValidPincode = typeof pincode === 'string' && /^[1-9][0-9]{5}$/.test(pincode.trim());

  const fetchPincodeDetails = useCallback(async (code) => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setCity(null);
    setState(null);

    try {
      const response = await fetch(
        `https://api.postalpincode.in/pincode/${encodeURIComponent(code.trim())}`,
        { signal: controller.signal },
      );

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Invalid response from PIN code service.');
      }

      const firstResult = data[0];

      if (firstResult.Status !== 'Success') {
        throw new Error(
          firstResult.Message || 'Could not find details for this PIN code.',
        );
      }

      const postOffices = firstResult.PostOffice;

      if (!Array.isArray(postOffices) || postOffices.length === 0) {
        throw new Error('No details found for this PIN code.');
      }

      const firstOffice = postOffices[0];

      setCity(firstOffice.District || firstOffice.Name || null);
      setState(firstOffice.State || null);
    } catch (err) {
      if (err.name === 'AbortError') {
        // Silently ignore aborted requests
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to fetch PIN code details.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Clear previous timer
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // Reset when pincode is cleared or invalid
    if (!isValidPincode) {
      setCity(null);
      setState(null);
      setError(null);
      setIsLoading(false);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      return;
    }

    // Debounce before calling the API
    timerRef.current = setTimeout(() => {
      fetchPincodeDetails(pincode);
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [pincode, isValidPincode, delayMs, fetchPincodeDetails]);

  return { city, state, isLoading, error };
}

