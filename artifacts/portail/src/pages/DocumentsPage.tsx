import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { api, type Livraison, type Profil } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  Loader2, ArrowLeft, Download, FileText, CreditCard,
  Camera, CheckCircle2, AlertCircle, User,
} from "lucide-react";
import BottomNav from "@/components/BottomNav";

const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR");
const fmt = (n: number | string) => Number(n).toLocaleString("fr-FR");

function compressImage(file: File, maxSize = 400, quality = 0.78): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.width, h = img.height;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else       { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas non supporté")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Erreur lecture image")); };
    img.src = url;
  });
}

export default function DocumentsPage() {
  const [, setLoc] = useLocation();
  const { profil, login } = useAuth() as { profil: Profil | null; loading: boolean; login: (p: Profil) => void; logout: () => void };
  const [livraisons, setLivraisons] = useState<Livraison[]>([]);
  const [loading, setLoading] = useState(true);

  // Photo upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoSuccess, setPhotoSuccess] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    api.livraisons().then(setLivraisons).finally(() => setLoading(false));
    if (profil?.photoUrl) setLocalPhotoUrl(profil.photoUrl);
  }, [profil?.photoUrl]);

  const sixMoisAvant = new Date();
  sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);
  const recents = livraisons.filter(l => new Date(l.dateLivraison) >= sixMoisAvant);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoSuccess(false);
    setPhotoUploading(true);
    try {
      const dataUrl = await compressImage(file, 400, 0.78);
      await api.uploadPhoto(dataUrl);
      setLocalPhotoUrl(dataUrl);
      setPhotoSuccess(true);
      if (profil) login({ ...profil, photoUrl: dataUrl });
      setTimeout(() => setPhotoSuccess(false), 3000);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Erreur upload");
    } finally {
      setPhotoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const token = localStorage.getItem("portail_token") ?? "";
  const carteUrl = api.carteMembreUrl();
  const downloadCarte = () => {
    fetch(carteUrl, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (!r.ok) return r.json().then(b => { throw new Error((b as { erreur?: string }).erreur ?? "Erreur"); });
        return r.blob();
      })
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `carte-${profil?.codeMembre ?? "membre"}.pdf`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(err => alert(err instanceof Error ? err.message : "Erreur téléchargement"));
  };

  const initiales = profil ? `${profil.nom[0] ?? ""}${profil.prenoms[0] ?? ""}`.toUpperCase() : "?";

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-green-700 px-5 pt-8 pb-6">
        <button onClick={() => setLoc("/")} className="flex items-center gap-2 text-green-200 mb-4">
          <ArrowLeft className="w-5 h-5" /> Retour
        </button>
        <h1 className="text-2xl font-bold text-white">📄 Mes documents</h1>
      </div>

      <div className="px-4 mt-4 space-y-4">

        {/* ── Photo de profil ── */}
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 bg-purple-100 rounded-2xl flex items-center justify-center">
              <User className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Ma photo de profil</h2>
              <p className="text-sm text-gray-500">Apparaît sur votre carte de membre</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="relative shrink-0">
              {localPhotoUrl ? (
                <img
                  src={localPhotoUrl}
                  alt="Photo profil"
                  className="w-24 h-24 rounded-full object-cover border-4 border-green-100"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center border-4 border-green-50">
                  <span className="text-3xl font-bold text-green-700">{initiales}</span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={photoUploading}
                className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700
                  text-white font-bold text-sm rounded-2xl py-3.5 transition-colors disabled:opacity-60"
              >
                {photoUploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</>
                ) : (
                  <><Camera className="w-4 h-4" /> {localPhotoUrl ? "Changer ma photo" : "Ajouter une photo"}</>
                )}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Photo de votre téléphone ou appareil photo
              </p>
              {photoSuccess && (
                <div className="flex items-center gap-1.5 justify-center text-green-600 text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Photo mise à jour !
                </div>
              )}
              {photoError && (
                <div className="flex items-center gap-1.5 justify-center text-red-500 text-xs">
                  <AlertCircle className="w-3.5 h-3.5" /> {photoError}
                </div>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* ── Carte de membre ── */}
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Carte de membre</h2>
              <p className="text-sm text-gray-500">{profil?.codeMembre}</p>
            </div>
          </div>

          {/* Aperçu visuel de la carte */}
          <div className="relative rounded-2xl overflow-hidden mb-4"
            style={{ background: "linear-gradient(135deg, #166534 0%, #1a4731 100%)", aspectRatio: "420/265" }}>
            <div className="absolute inset-0 p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold tracking-widest text-white opacity-80">CARTE DE MEMBRE</p>
                <p className="text-[10px] text-green-300 mt-0.5">CoopDigital</p>
                <div className="mt-3 w-12 h-0.5 bg-yellow-400 opacity-70 rounded" />
              </div>
              <div>
                <p className="text-base font-bold text-white leading-tight">
                  {profil?.nom} {profil?.prenoms}
                </p>
                <p className="text-xs text-yellow-400 font-mono mt-0.5">{profil?.codeMembre}</p>
                {localPhotoUrl && (
                  <img
                    src={localPhotoUrl}
                    alt=""
                    className="absolute top-3 right-3 w-12 h-12 rounded-full object-cover border-2 border-yellow-400"
                  />
                )}
                <div className="mt-2 flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    profil?.carteStatut === "suspendue"
                      ? "bg-red-500 text-white"
                      : "bg-green-400 text-green-900"
                  }`}>
                    {profil?.carteStatut === "suspendue" ? "SUSPENDUE" :
                     profil?.carteStatut === "active"    ? "● ACTIVE"  : "NON ÉMISE"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {profil?.carteStatut === "suspendue" ? (
            <div className="flex items-center gap-2 bg-red-50 rounded-2xl p-4 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Votre carte a été suspendue par l'administration. Contactez votre coopérative.
            </div>
          ) : (
            <button
              onClick={downloadCarte}
              className="flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700
                text-white font-bold text-base rounded-2xl py-4 transition-colors w-full"
            >
              <Download className="w-5 h-5" />
              {profil?.carteStatut === "active" ? "Télécharger ma carte (PDF)" : "Générer et télécharger (PDF)"}
            </button>
          )}
        </div>

        {/* ── Reçus de livraison ── */}
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Reçus de paiement</h2>
              <p className="text-sm text-gray-500">6 derniers mois</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-green-600" />
            </div>
          ) : recents.length === 0 ? (
            <p className="text-gray-400 text-center py-6 text-base">Aucun reçu disponible</p>
          ) : (
            <div className="space-y-3">
              {recents.map(l => (
                <div key={l.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div>
                    <div className="text-base font-semibold text-gray-800">
                      {fmtDate(l.dateLivraison)} — {fmt(l.poidsKg)} kg
                    </div>
                    <div className="text-sm text-gray-500">
                      Net reçu : <span className="font-bold text-green-700">{fmt(l.montantNetFcfa)} FCFA</span>
                    </div>
                    {l.codeAchat && <div className="text-xs text-gray-400 font-mono">{l.codeAchat}</div>}
                  </div>
                  <a
                    href={api.recuPdfUrl(l.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50
                      rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-700 shrink-0 ml-3"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
