import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

interface QRScannerProps {
  onResult: (text: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onResult, onClose }: QRScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    async function demarrer() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const id = "qr-reader-" + Math.random().toString(36).slice(2);
        if (containerRef.current) containerRef.current.id = id;

        const scanner = new Html5Qrcode(id);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            onResult(decodedText);
          },
          () => {}
        );
        setChargement(false);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
          setErreur("Accès à la caméra refusé. Veuillez autoriser la caméra dans les paramètres.");
        } else {
          setErreur("Impossible d'accéder à la caméra : " + msg);
        }
        setChargement(false);
      }
    }

    demarrer();

    return () => {
      const s = scannerRef.current;
      if (s) {
        void s.clear();
        scannerRef.current = null;
      }
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">
        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-gray-600" />
            <h3 className="font-semibold text-gray-900">Scanner un QR code</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Fermer le scanner"
          >
            <X size={20} />
          </button>
        </div>

        {/* Zone de scan */}
        <div className="relative bg-black">
          {chargement && !erreur && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-white text-sm flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Activation de la caméra…</span>
              </div>
            </div>
          )}
          {erreur ? (
            <div className="p-6 text-center">
              <Camera size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm text-gray-600">{erreur}</p>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="w-full"
              style={{ minHeight: 280 }}
            />
          )}
        </div>

        {/* Instruction */}
        {!erreur && (
          <div className="px-5 py-4 text-center">
            <p className="text-xs text-gray-500">
              Pointez la caméra vers un QR code de membre ou de lot
            </p>
          </div>
        )}

        <div className="px-5 pb-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
