import { useState, useEffect } from "react";
import { WifiOff, Wifi } from "lucide-react";

export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const on  = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online",  on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-500 text-white text-sm font-medium px-4 py-2.5 flex items-center justify-center gap-2 shadow-md">
      <WifiOff size={15} />
      <span>Hors connexion — certaines données peuvent être obsolètes</span>
    </div>
  );
}

export function OnlineToast() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = () => {
      setShow(true);
      timer = setTimeout(() => setShow(false), 3000);
    };
    window.addEventListener("online", on);
    return () => {
      window.removeEventListener("online", on);
      clearTimeout(timer);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-full flex items-center gap-2 shadow-lg animate-in fade-in slide-in-from-top-2">
      <Wifi size={15} />
      Connexion rétablie
    </div>
  );
}
