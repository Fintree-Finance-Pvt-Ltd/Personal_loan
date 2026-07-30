let easebuzzPromise = null;

export function loadEasebuzzCheckout() {
  if (window.EasebuzzCheckout) {
    return Promise.resolve(window.EasebuzzCheckout);
  }

  if (easebuzzPromise) {
    return easebuzzPromise;
  }

  easebuzzPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector('script[src*="easebuzz-checkout"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        if (window.EasebuzzCheckout) resolve(window.EasebuzzCheckout);
        else reject(new Error('EasebuzzCheckout script loaded but window.EasebuzzCheckout is undefined'));
      });
      existingScript.addEventListener('error', () => reject(new Error('Failed loading existing EasebuzzCheckout script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.min.js';
    script.async = true;
    script.onload = () => {
      if (window.EasebuzzCheckout) {
        resolve(window.EasebuzzCheckout);
      } else {
        reject(new Error('EasebuzzCheckout SDK script loaded but constructor was not found.'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load EasebuzzCheckout SDK script.'));
    };
    document.body.appendChild(script);
  });

  return easebuzzPromise;
}
