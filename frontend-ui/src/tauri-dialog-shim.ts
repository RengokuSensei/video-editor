import { invoke } from '@tauri-apps/api/core';

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  filters?: DialogFilter[];
}

export async function open(options?: OpenDialogOptions): Promise<string | string[] | null> {
  console.log("Tauri Dialog Shim: open() triggered with options:", options);
  // Invoke the native Rust command which utilizes RFD to pick a file
  const path = await invoke<string | null>('open_file_dialog');
  return path;
}

export async function save(): Promise<string | null> {
  console.log("Tauri Dialog Shim: save() triggered");
  const path = await invoke<string | null>('save_file_dialog');
  return path;
}
