import { useAuth } from "@/contexts/AuthContext";
import BiometrieSection from "@/components/BiometrieSection";
import { UserRound } from "lucide-react";

export default function MonProfilPage() {
  const { utilisateur } = useAuth();

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
