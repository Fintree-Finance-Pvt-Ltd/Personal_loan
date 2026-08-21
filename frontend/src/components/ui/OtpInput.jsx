import { useEffect, useRef } from 'react';

/**
 * Segmented OTP entry — one focused box per digit, auto-advances on type, steps back on
 * backspace, and accepts a full pasted code in one go. Renders as plain numeric text
 * inputs under the hood so mobile devices show the numeric keypad automatically.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  autoFocus = false,
  disabled = false,
  error = false,
  id,
}) {
  const inputRefs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value?.[i] || '');

  useEffect(() => {
    if (autoFocus) {
      inputRefs.current[0]?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setDigit = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join(''));
  };

  const handleChange = (index, rawValue) => {
    const clean = rawValue.replace(/\D/g, '');
    if (!clean) {
      setDigit(index, '');
      return;
    }
    if (clean.length > 1) {
      // A multi-character value here means the browser delivered a paste through onChange
      // rather than onPaste (happens on some mobile keyboards) — fill forward from here.
      const next = digits.slice();
      let cursor = index;
      for (const char of clean) {
        if (cursor >= length) break;
        next[cursor] = char;
        cursor += 1;
      }
      onChange(next.join(''));
      inputRefs.current[Math.min(cursor, length - 1)]?.focus();
      return;
    }
    setDigit(index, clean);
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    event.preventDefault();
    onChange(pasted);
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div
      role="group"
      aria-label="One-time password"
      id={id}
      className="flex gap-2"
      onPaste={handlePaste}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { inputRefs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onFocus={(e) => e.target.select()}
          className={`h-12 w-10 rounded-xl border text-center text-lg font-bold text-neutral-900 outline-none transition-all duration-150 sm:h-14 sm:w-12 ${
            error
              ? 'border-danger-400 ring-4 ring-danger-50'
              : digit
                ? 'border-brand-400 bg-brand-50/60'
                : 'border-neutral-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-50'
          } ${disabled ? 'cursor-not-allowed bg-neutral-100 text-neutral-400' : 'bg-white'}`}
        />
      ))}
    </div>
  );
}
