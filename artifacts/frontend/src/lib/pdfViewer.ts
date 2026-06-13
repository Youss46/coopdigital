/**
 * Singleton pour ouvrir le viewer PDF depuis n'importe où —
 * y compris des fonctions module-level sans accès aux hooks React.
 */
type Handler = (blobUrl: string, filename: string) => void;

let _handler: Handler | null = null;

export function openPdfViewer(blobUrl: string, filename: string): void {
  if (_handler) {
    _handler(blobUrl, filename);
  } else {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 500);
  }
}

export function registerPdfViewerHandler(h: Handler): () => void {
  _handler = h;
  return () => {
    if (_handler === h) _handler = null;
  };
}
