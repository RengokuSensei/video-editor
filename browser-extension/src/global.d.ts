declare module '/wasm/video_editor_wasm.js' {
  const createVideoEditorModule: (options?: any) => Promise<any>;
  export default createVideoEditorModule;
}
