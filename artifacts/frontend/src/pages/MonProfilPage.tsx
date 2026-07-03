import { useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import BiometrieSection from "@/components/BiometrieSection";
import { UserRound, Camera, Trash2, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useSaveAuthPhoto, ApiError } from "@workspace/api-client-react";

const MAX_BYTES = 300 * 1024;

async function resizeAndCompressPhoto(file: File): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = raw;
  });

  let bestUrl: string | null = null;

  // Réduit progressivement la dimension max si la compression seule ne suffit pas
  // à passer sous la cible, afin de garantir que le serveur n'ait jamais à rejeter la photo.
  for (const maxDim of [400, 300, 220, 160]) {
    const scale  = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const width  = Math.max(1, Math.round(img.naturalWidth  * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.90, 0.80, 0.70, 0.60]) {
      const jpegUrl = canvas.toDataURL("image/jpeg", quality);
      const jpegBytes = Math.ceil((jpegUrl.split(",")[1]?.length ?? 0) * 0.75);
      bestUrl = jpegUrl;
      if (jpegBytes <= MAX_BYTES) {
        return jpegUrl;
      }
    }
  }

  return bestUrl!;
}

export default function MonProfilPage() {
  const { utilisateur, updatePhotoUrl } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const savePhoto = useSaveAuthPhoto({
    mutation: {
      onSuccess: (res) => {
        updatePhotoUrl(res.photoUrl ?? null);
        toast({ title: res.photoUrl ? "Photo de profil mise à jour" : "Photo de profil supprimée" });
      },
      onError: (err) => {
        const detail = err instanceof ApiError && err.data && typeof err.data === "object" && "erreur" in err.data
          ? String((err.data as { erreur?: string }).erreur)
          : undefined;
        toast({
          title: "Erreur lors de l'enregistrement de la photo",
          description: detail,
          variant: "destructive",
        });
      },
      onSettled: () => setIsUploading(false),
    },
  });

  async function handleFile(file: File) {
    const ACCEPTED = ["image/png", "image/jpeg", "image/jpg"];
    if (!ACCEPTED.includes(file.type)) {
      toast({
        title: "Format non supporté",
        description: "Utilisez un fichier PNG ou JPEG.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      const dataUrl = await resizeAndCompressPhoto(file);
      savePhoto.mutate({ data: { photoDataUrl: dataUrl } });
    } catch {
      setIsUploading(false);
      toast({ title: "Erreur lors du traitement de l'image", variant: "destructive" });
    }
  }

  function handleRemove() {
    setIsUploading(true);
    savePhoto.mutate({ data: { photoDataUrl: null } });
  }

  const initiale = utilisateur?.nom?.[0]?.toUpperCase() ?? "U";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Mon profil</h1>
        <p className="text-sm text-gray-500">Vos informations personnelles et vos paramètres de connexion.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <UserRound className="w-4 h-4" /> Informations
        </h2>

        <div className="flex items-center gap-4 mb-5">
          <div className="relative">
            <Avatar className="w-20 h-20">
              <AvatarImage src={utilisateur?.photoUrl ?? undefined} alt="Photo de profil" />
              <AvatarFallback className="text-xl font-bold text-white" style={{ backgroundColor: "#c4962a" }}>
                {initiale}
              </AvatarFallback>
            </Avatar>
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Camera className="w-4 h-4 mr-2" />
              {utilisateur?.photoUrl ? "Changer la photo" : "Ajouter une photo"}
            </Button>
            {utilisateur?.photoUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isUploading}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleRemove}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Nom complet</p>
            <p className="font-medium text-gray-900">{utilisateur?.prenoms} {utilisateur?.nom}</p>
          </div>
          <div>
            <p className="text-gray-500">Rôle</p>
            <p className="font-medium text-gray-900 uppercase">{utilisateur?.role?.replace(/_/g, " ")}</p>
          </div>
        </div>
      </div>

      <BiometrieSection />
    </div>
  );
}
