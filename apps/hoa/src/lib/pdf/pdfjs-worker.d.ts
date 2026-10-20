// pdfjs-dist ships no types for its worker module. Importing it only
// registers globalThis.pdfjsWorker (see extract-text.ts); nothing is used.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
