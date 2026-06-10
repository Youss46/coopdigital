import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetUsers,
  useCreateUser,
  useDeleteUser,
  useToggleUserActif,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Trash2, ToggleLeft, ToggleRight, ShieldCheck, Copy, RefreshCw, CheckCheck, Share2 } from "lucide-react";

// ——— Génération de mot de passe sécurisé ———
function genererMotDePasse(): string {
  const maj = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const min = "abcdefghjkmnpqrstuvwxyz";
  const chiffres = "23456789";
  const speciaux = "!@#$";
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const chars = [
    pick(maj), pick(maj),
    pick(min), pick(min), pick(min),
    pick(chiffres), pick(chiffres), pick(chiffres),
    pick(speciaux),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

// ——— Rôles ———
type UserRole =
  | "pca"
  | "directeur"
  | "comptable"
  | "magasinier"
  | "responsable_tracabilite"
  | "delegue"
  | "auditeur"
  | "agent_terrain";

const ROLE_LABELS: Record<UserRole, string> = {
  pca: "PCA",
  directeur: "Directeur",
  comptable: "Comptable",
  magasinier: "Magasinier",
  responsable_tracabilite: "Resp. Traçabilité",
  delegue: "Délégué de localité",
  auditeur: "Auditeur",
  agent_terrain: "Agent terrain",
};

const ROLE_BADGE_STYLE: Record<UserRole, { bg: string; text: string }> = {
  pca: { bg: "#4c1d95", text: "#ffffff" },
  directeur: { bg: "#1a4731", text: "#ffffff" },
  comptable: { bg: "#1d4ed8", text: "#ffffff" },
  magasinier: { bg: "#c2410c", text: "#ffffff" },
  responsable_tracabilite: { bg: "#0f766e", text: "#ffffff" },
  delegue: { bg: "#15803d", text: "#ffffff" },
  auditeur: { bg: "#a16207", text: "#ffffff" },
  agent_terrain: { bg: "#065f46", text: "#ffffff" },
};

// Rôles créables selon le rôle du demandeur
function getRolesCreables(requesterRole: string): UserRole[] {
  const all: UserRole[] = [
    "pca",
    "directeur",
    "comptable",
    "magasinier",
    "responsable_tracabilite",
    "delegue",
    "agent_terrain",
    "auditeur",
  ];
  if (requesterRole === "pca") return all;
  if (requesterRole === "directeur") return all.filter((r) => r !== "pca");
  return [];
}

function RoleBadge({ role }: { role: string }) {
  const r = role as UserRole;
  const style = ROLE_BADGE_STYLE[r] ?? { bg: "#6b7280", text: "#ffffff" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {ROLE_LABELS[r] ?? role}
    </span>
  );
}

function Initiales({ nom, prenoms }: { nom: string; prenoms: string }) {
  const letters = `${prenoms[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
      style={{ backgroundColor: "#c4962a" }}
    >
      {letters}
    </div>
  );
}

// ——— Modal création ———
interface CreateModalProps {
  requesterRole: string;
  onClose: () => void;
  onSuccess: () => void;
}

function CreateModal({ requesterRole, onClose, onSuccess }: CreateModalProps) {
  const { toast } = useToast();
  const createMutation = useCreateUser();
  const [phase, setPhase] = useState<"form" | "succes">("form");
  const [motDePasse, setMotDePasse] = useState(() => genererMotDePasse());
  const [copie, setCopie] = useState(false);
  const [form, setForm] = useState({
    nom: "",
    prenoms: "",
    email: "",
    telephone: "",
    role: "" as UserRole | "",
    section: "",
    zoneType: "" as "section" | "groupement" | "village" | "",
    zoneNom: "",
    zoneVillages: "",
  });

  const rolesDisponibles = getRolesCreables(requesterRole);

  const regenerer = useCallback(() => {
    setMotDePasse(genererMotDePasse());
    setCopie(false);
  }, []);

  const copierMDP = useCallback(async () => {
    await navigator.clipboard.writeText(motDePasse);
    setCopie(true);
    setTimeout(() => setCopie(false), 2000);
  }, [motDePasse]);

  const partagerWhatsApp = useCallback(() => {
    const appUrl = window.location.origin + (import.meta.env.BASE_URL ?? "/");
    const ligne = (label: string, val: string) => `${label} : ${val}`;
    const msg = [
      `Bonjour ${form.prenoms || ""},`,
      "",
      "Voici vos informations de connexion CoopDigital :",
      ligne("🌐 Adresse", appUrl),
      ligne("📧 Email", form.email || "—"),
      ligne("🔑 Mot de passe temporaire", motDePasse),
      "",
      "Merci de changer votre mot de passe dès la première connexion.",
      "— CoopDigital",
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  }, [form.prenoms, form.email, motDePasse]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role) return;
    createMutation.mutate(
      {
        data: {
          nom: form.nom,
          prenoms: form.prenoms,
          email: form.email,
          telephone: form.telephone || undefined,
          role: form.role as UserRole,
          motDePasse,
          section: form.section || undefined,
          zoneType: (form.zoneType || undefined) as "section" | "groupement" | "village" | undefined,
          zoneNom: form.zoneNom || undefined,
          zoneVillages: form.zoneVillages || undefined,
        },
      },
      {
        onSuccess: () => {
          onSuccess();
          setPhase("succes");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erreur lors de la création";
          toast({ title: "Erreur", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">

        {/* ——— Phase succès ——— */}
        {phase === "succes" ? (
          <>
            <div className="px-6 pt-6 pb-4 text-center">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: "#d1fae5" }}
              >
                <CheckCheck className="w-6 h-6" style={{ color: "#1a4731" }} />
              </div>
              <h3 className="font-bold text-gray-900 text-lg">Compte créé !</h3>
              <p className="text-sm text-gray-500 mt-1">
                {form.prenoms} {form.nom} · <RoleBadge role={form.role || "delegue"} />
              </p>
            </div>

            <div className="mx-6 mb-4 rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
              <div className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Email</p>
                  <p className="text-sm font-medium text-gray-800 break-all">{form.email}</p>
                </div>
              </div>
              <div className="px-4 py-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Mot de passe temporaire</p>
                  <p className="text-sm font-mono font-bold text-gray-900 tracking-wider">{motDePasse}</p>
                </div>
                <button
                  type="button"
                  onClick={copierMDP}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                  style={copie
                    ? { backgroundColor: "#d1fae5", color: "#1a4731" }
                    : { backgroundColor: "#f3f4f6", color: "#374151" }}
                >
                  {copie ? <CheckCheck size={13} /> : <Copy size={13} />}
                  {copie ? "Copié !" : "Copier"}
                </button>
              </div>
            </div>

            <div className="px-6 pb-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={partagerWhatsApp}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-medium"
                style={{ backgroundColor: "#25D366" }}
              >
                <Share2 size={15} />
                Partager sur WhatsApp
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
          </>
        ) : (
          /* ——— Phase formulaire ——— */
          <>
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: "#1a4731" }}
              >
                <UserPlus className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">Créer un compte</h3>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Prénom(s)</label>
                  <input
                    type="text"
                    required
                    value={form.prenoms}
                    onChange={(e) => setForm({ ...form, prenoms: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="Jean-Baptiste"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nom</label>
                  <input
                    type="text"
                    required
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="KOUASSI"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Adresse email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="prenom.nom@coopdigital.ci"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Téléphone <span className="text-gray-400">(optionnel)</span>
                </label>
                <input
                  type="tel"
                  value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="+225 07 00 00 00 00"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rôle</label>
                <select
                  required
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as UserRole, section: "", zoneType: "", zoneNom: "", zoneVillages: "" })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                >
                  <option value="">Sélectionner un rôle…</option>
                  {rolesDisponibles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>

              {form.role === "agent_terrain" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Zone d'intervention <span className="text-gray-400">(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={form.section}
                    onChange={(e) => setForm({ ...form, section: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    placeholder="ex. Zone Nord, Secteur Broukro…"
                  />
                </div>
              )}

              {form.role === "delegue" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Type de zone <span className="text-gray-400">(optionnel)</span>
                    </label>
                    <div className="flex gap-4">
                      {(["section", "groupement", "village"] as const).map((t) => (
                        <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="zoneType"
                            value={t}
                            checked={form.zoneType === t}
                            onChange={() => setForm({ ...form, zoneType: t })}
                            className="accent-green-600"
                          />
                          <span className="text-sm capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Nom de la zone <span className="text-gray-400">(optionnel)</span>
                    </label>
                    <input
                      type="text"
                      value={form.zoneNom}
                      onChange={(e) => setForm({ ...form, zoneNom: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="ex. Village Broukro, Groupement Sud…"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Villages couverts <span className="text-gray-400">(optionnel, séparés par des virgules)</span>
                    </label>
                    <input
                      type="text"
                      value={form.zoneVillages}
                      onChange={(e) => setForm({ ...form, zoneVillages: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="ex. Broukro, Kpata, Amoriakro"
                    />
                  </div>
                </>
              )}

              {/* Mot de passe auto-généré */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-gray-700">Mot de passe temporaire</label>
                  <button
                    type="button"
                    onClick={regenerer}
                    className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                  >
                    <RefreshCw size={11} />
                    Régénérer
                  </button>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center px-3 py-2 border border-gray-200 rounded-lg bg-gray-50">
                    <span className="text-sm font-mono font-semibold text-gray-800 tracking-wider flex-1">
                      {motDePasse}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={copierMDP}
                    title="Copier le mot de passe"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
                    style={copie
                      ? { backgroundColor: "#d1fae5", borderColor: "#6ee7b7", color: "#1a4731" }
                      : { backgroundColor: "white", borderColor: "#e5e7eb", color: "#374151" }}
                  >
                    {copie ? <CheckCheck size={15} /> : <Copy size={15} />}
                    {copie ? "Copié !" : "Copier"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Généré automatiquement · modifiable si besoin
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                  style={{ backgroundColor: "#1a4731" }}
                >
                  {createMutation.isPending ? "Création…" : "Créer le compte"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ——— Modal confirmation suppression ———
interface DeleteModalProps {
  nom: string;
  prenoms: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

function DeleteModal({ nom, prenoms, onConfirm, onCancel, loading }: DeleteModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Supprimer le compte</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600">
            Voulez-vous vraiment supprimer le compte de{" "}
            <span className="font-medium text-gray-900">
              {prenoms} {nom}
            </span>{" "}
            ? Cette action est irréversible.
          </p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60 bg-red-600 hover:bg-red-700"
          >
            {loading ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ——— Page principale ———
export default function ComptesPage() {
  const { utilisateur } = useAuth();
  const { toast } = useToast();

  const requesterRole = utilisateur?.role ?? "";
  const requesterId = utilisateur?.id ?? 0;

  const { data: comptes, isLoading, refetch } = useGetUsers();
  const deleteMutation = useDeleteUser();
  const toggleMutation = useToggleUserActif();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    nom: string;
    prenoms: string;
  } | null>(null);

  // Accès refusé si pas PCA / Directeur
  if (!["pca", "directeur"].includes(requesterRole)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center">
        <ShieldCheck className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">Accès réservé au PCA et au Directeur</p>
      </div>
    );
  }

  function handleToggle(id: number, currentActif: boolean) {
    toggleMutation.mutate(
      { id, data: { actif: !currentActif } },
      {
        onSuccess: () => {
          void refetch();
          toast({
            title: currentActif ? "Compte désactivé" : "Compte activé",
          });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erreur";
          toast({ title: "Erreur", description: msg, variant: "destructive" });
        },
      },
    );
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { id: deleteTarget.id },
      {
        onSuccess: () => {
          void refetch();
          toast({ title: "Compte supprimé" });
          setDeleteTarget(null);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erreur";
          toast({ title: "Erreur", description: msg, variant: "destructive" });
          setDeleteTarget(null);
        },
      },
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des comptes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {comptes?.length ?? 0} compte{(comptes?.length ?? 0) > 1 ? "s" : ""} enregistré
            {(comptes?.length ?? 0) > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: "#1a4731" }}
        >
          <UserPlus size={16} />
          Créer un compte
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            Chargement…
          </div>
        ) : !comptes || comptes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldCheck className="w-10 h-10 text-gray-200 mb-3" />
            <p className="text-gray-500 text-sm">Aucun compte trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Utilisateur</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Rôle</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">
                    Créé le
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {comptes.map((compte) => {
                  const isOwn = compte.id === requesterId;
                  const isPca = compte.role === "pca";
                  const canDelete =
                    (requesterRole === "pca" && !isOwn) ||
                    (requesterRole === "directeur" && !isPca && !isOwn);

                  return (
                    <tr key={compte.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Initiales nom={compte.nom} prenoms={compte.prenoms} />
                          <div>
                            <p className="font-medium text-gray-900">
                              {compte.prenoms} {compte.nom}
                            </p>
                            <p className="text-xs text-gray-400">{compte.email}</p>
                            {compte.telephone && (
                              <p className="text-xs text-gray-400">{compte.telephone}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={compte.role} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            compte.actif
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {compte.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">
                        {new Date(compte.createdAt).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* Activer / Désactiver — pas sur soi-même et pas PCA désactivé */}
                          {!isOwn && !isPca && (
                            <button
                              onClick={() => handleToggle(compte.id, compte.actif)}
                              disabled={toggleMutation.isPending}
                              title={compte.actif ? "Désactiver" : "Activer"}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                              {compte.actif ? (
                                <ToggleRight size={18} className="text-green-600" />
                              ) : (
                                <ToggleLeft size={18} />
                              )}
                            </button>
                          )}

                          {/* Supprimer — visible uniquement si autorisé */}
                          {canDelete && (
                            <button
                              onClick={() =>
                                setDeleteTarget({
                                  id: compte.id,
                                  nom: compte.nom,
                                  prenoms: compte.prenoms,
                                })
                              }
                              title="Supprimer"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal création */}
      {showCreate && (
        <CreateModal
          requesterRole={requesterRole}
          onClose={() => setShowCreate(false)}
          onSuccess={() => void refetch()}
        />
      )}

      {/* Modal confirmation suppression */}
      {deleteTarget && (
        <DeleteModal
          nom={deleteTarget.nom}
          prenoms={deleteTarget.prenoms}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
