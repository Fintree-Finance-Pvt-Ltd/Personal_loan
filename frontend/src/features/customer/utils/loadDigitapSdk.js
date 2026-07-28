let sdkPromise = null;

export const loadDigitapSdk = () => {
  if (sdkPromise) {
    return sdkPromise;
  }

  // Check if it's already in the window object (e.g., loaded in HTML manually)
  if (window.ekyc) {
    sdkPromise = Promise.resolve(window.ekyc);
    return sdkPromise;
  }

  sdkPromise = new Promise((resolve, reject) => {
    const rawEnv = String(import.meta.env.VITE_FRONTEND_DIGITAP_ENV || 'UAT').toUpperCase();
    const isProd = rawEnv.startsWith('PROD');
    
    // Choose correct SDK URL based on environment
    const src = isProd 
      ? 'https://sdk.digitap.ai/ekyc/scripts/ekyc.js' 
      : 'https://sdksb.digitap.work/ekyc/scripts/ekyc.js';
    
    const script = document.createElement('script');
    script.src = src;
    script.type = 'text/javascript';
    script.async = true;

    script.onload = () => {
      // Typically, Digitap exposes `ekyc` globally
      if (window.ekyc) {
        resolve(window.ekyc);
      } else {
        reject(new Error('Digitap ekyc SDK loaded but global object not found'));
      }
    };

    script.onerror = () => {
      reject(new Error(`Failed to load Digitap SDK from ${src}`));
    };

    document.head.appendChild(script);
  });

  return sdkPromise;
};
