export const invoke = (...args: any[]) => {
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    // Only import invoke dynamically if we are in Tauri
    return import('@tauri-apps/api/core').then((m) => m.invoke(...args as [string, any]));
  }
  console.warn('Tauri API invoke called in browser environment (not supported)', args);
  return Promise.resolve();
};

export const convertFileSrc = (filePath: string, protocol = 'asset') => {
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    // Return standard dummy string or something similar since we can't synchronously return a Promise if the original function returns a string.
    // Actually convertFileSrc returns a string synchronously.
    return (window as any).__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
  }
  return filePath;
}
