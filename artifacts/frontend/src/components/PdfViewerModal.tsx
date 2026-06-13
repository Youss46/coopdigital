import { useEffect, useRef, useState, useCallback } from "react";
import { X, Download, Printer, Loader2, FileText } from "lucide-react";
import { registerPdfViewerHandler } from "@/lib/pdfViewer";

interface PdfEntry {
  blobUrl: string;
  filename: string;
}

export default function PdfViewerModal() {
  const [entry, setEntry] = useState<PdfEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    return registerPdfViewerHandler((blobUrl, filename) => {
      setLoaded(false);
      setEntry({ blobUrl, filename });
    });
  }, []);

  const close = useCallback(() => {
    if (entry) URL.revokeObjectURL(entry.blobUrl);
    setEntry(null);
    setLoaded(false);
  }, [entry]);

  const handleDownload = useCallback(() => {
    if (!entry) return;
    const a = document.createElement("a");
    a.href = entry.blobUrl;
    a.download = entry.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [entry]);

  const handlePrint = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    if (entry) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, close]);

  if (!entry) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      {/* Barre de contrôle */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white shrink-0">
        <FileText className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="flex-1 text-sm font-medium truncate text-gray-100">
          {entry.filename}
        </span>

        <button
          onClick={handlePrint}
          title="Imprimer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm transition-colors"
        >
          <Printer className="h-4 w-4" />
          <span className="hidden sm:inline">Imprimer</span>
        </button>

        <button
          onClick={handleDownload}
          title="Télécharger"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-green-700 hover:bg-green-600 text-sm transition-colors"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Télécharger</span>
        </button>

        <button
          onClick={close}
          title="Fermer"
          className="p-1.5 rounded hover:bg-gray-700 transition-colors ml-1"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Zone PDF */}
      <div className="flex-1 relative overflow-hidden">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={entry.blobUrl}
          title={entry.filename}
          className="w-full h-full border-0"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  );
}
