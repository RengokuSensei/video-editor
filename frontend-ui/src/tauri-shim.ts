import { invoke as coreInvoke } from '@tauri-apps/api/core';

export const invoke = <T = unknown>(...args: any[]): Promise<T> => {
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    return coreInvoke(...args as [string, any]) as Promise<T>;
  }
  console.warn('Tauri API invoke called in browser environment (not supported)', args);
  return Promise.resolve() as Promise<any>;
};

export const convertFileSrc = (filePath: string, protocol = 'asset') => {
  if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
    return (window as any).__TAURI_INTERNALS__.convertFileSrc(filePath, protocol);
  }
  return filePath;
}
