import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Fingerprint, Loader2, Trash2, ShieldCheck } from "lucide-react";
import {
  biometrieDisponible,
  enregistrerBiometrie,
  listerCredentialsBiometriques,
  supprimerCredentialBiometrique,
  type BiometricCredential,
} from "@/lib/webauthn";

function detecterNomAppareil(): string {
  const ua = navigator.userAgent;
  if (/iphone/i.test(ua)) return "iPhone";
  if (/ipad/i.test(ua)) return "iPad";
  if (/android/i.test(ua)) return "Appareil Android";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "PC Windows";
  return "Cet appareil";
}

export default function BiometrieSection() {
  const { toast } = useToast();
  const [supporte] = useState(() => biometrieDisponible());
  const [credentials, setCredentials] = useState<BiometricCredential[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrementEnCours, setEnregistrementEnCours] = useState(false);
  const [suppressionId, setSuppressionId] = useState<number | null>(null);

  const charger = async () => {
    setChargement(true);
    try {
      const data = await listerCredentialsBiometriques();
      setCredentials(data);
    } catch {
      // silencieux — la section reste vide en cas d'erreur réseau
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    void charger();
  }, []);

  const handleEnregistrer = async () => {
    setEnregistrementEnCours(true);
    try {
      await enregistrerBiometrie(detecterNomAppareil());
      toast({ title: "Authentification biométrique activée sur cet appareil" });
      await charger();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Impossible d'activer la biométrie";
      toast({ title: message, variant: "destructive" });
    } finally {
      setEnregistrementEnCours(false);
    }
  };

  const handleSupprimer = async (id: number) => {
    try {
      await supprimerCredentialBiometrique(id);
      toast({ title: "Identifiant biométrique supprimé" });
      setCredentials((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Suppression impossible";
      toast({ title: message, variant: "destructive" });
    } finally {
      setSuppressionId(null);
    }
  };

  if (!supporte) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <Fingerprint className="w-4 h-4" /> Connexion biométrique
        </h2>
        <p className="text-sm text-gray-500">
          Cet appareil ou ce navigateur ne prend pas en charge la connexion biométrique (empreinte digitale / Face ID).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
        <Fingerprint className="w-4 h-4" /> Connexion biométrique
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        Activez la connexion par empreinte digitale ou Face ID pour vous connecter sans mot de passe sur cet appareil.
      </p>

      <Button
        onClick={handleEnregistrer}
        disabled={enregistrementEnCours}
        className="bg-green-700 hover:bg-green-800 text-white mb-4"
      >
        {enregistrementEnCours ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <ShieldCheck className="w-4 h-4 mr-2" />
        )}
        Activer sur cet appareil
      </Button>

      {chargement ? (
        <div className="py-4 text-center text-gray-400 text-sm">Chargement...</div>
      ) : credentials.length === 0 ? (
        <p className="text-sm text-gray-400">Aucun appareil biométrique enregistré pour le moment.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Appareil</TableHead>
              <TableHead>Ajouté le</TableHead>
              <TableHead>Dernière utilisation</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.nomAppareil ?? "Appareil"}</TableCell>
                <TableCell>{new Date(c.createdAt).toLocaleDateString("fr-FR")}</TableCell>
                <TableCell>
                  {c.derniereUtilisation
                    ? new Date(c.derniereUtilisation).toLocaleDateString("fr-FR")
                    : "Jamais"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSuppressionId(c.id)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={suppressionId !== null} onOpenChange={(open) => !open && setSuppressionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet identifiant biométrique ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous ne pourrez plus vous connecter par empreinte digitale ou Face ID depuis cet appareil.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => suppressionId && handleSupprimer(suppressionId)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
