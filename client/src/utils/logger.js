//used for debug only console logging, to avoid spamming normal use with console logs.
export const debugLog = (...args) => {
  if (import.meta.env.VITE_ENABLE_DEBUG === 'true') {
    console.log('[DEBUG]:', ...args);
  }
};