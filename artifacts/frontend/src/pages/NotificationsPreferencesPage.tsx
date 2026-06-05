import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Bell, ArrowLeft, Save } from "lucide-react";
import {
  useGetPreferencesNotifications,
  useUpdatePreferencesNotifications,
  getGetPreferencesNotificationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type PrefsForm = {
  notif_stock_faible:             boolean;
  notif_avance_retard:            boolean;
  notif_creance_retard:           boolean;
  notif_refus_non_traite:         boolean;
  notif_anomalie_critique:        boolean;
  notif_certification_expiration: boolean;
  notif_echeance_emprunt:         boolean;
  notif_bulletin_attente:         boolean;
  notif_ecriture_attente:         boolean;
  notif_ag_planifiee:             boolean;
  notif_message_recu:             boolean;
  notif_budget_depasse:           boolean;
  notif_prix_change:              boolean;
  recevoir_sms:                   boolean;
  recevoir_email:                 boolean;
};

const NOTIF_LABELS: { key: keyof PrefsForm; label: string; desc: string }[] = [
  { key: "notif_stock_faible",             label: "Stock faible",                desc: "Quand un intrant passe sous le seuil minimum" },
  { key: "notif_avance_retard",            label: "Avances en retard",           desc: "Avances non remboursées après l'échéance" },
  { key: "notif_creance_retard",           label: "Créances en retard",          desc: "Créances exportateur non réglées à temps" },
  { key: "notif_refus_non_traite",         label: "Refus non traités",           desc: "Stocks refoulés sans traitement" },
  { key: "notif_anomalie_critique",        label: "Anomalies critiques",         desc: "Détection d'anomalies de niveau critique" },
  { key: "notif_certification_expiration", label: "Certifications expirantes",   desc: "Certifications expirant dans 30 jours" },
  { key: "notif_echeance_emprunt",         label: "Échéances d'emprunt",         desc: "Remboursements d'emprunt dans 7 jours" },
  { key: "notif_bulletin_attente",         label: "Bulletins en attente",        desc: "Bulletins de salaire à valider" },
  { key: "notif_ecriture_attente",         label: "Écritures en attente",        desc: "Écritures comptables à valider" },
  { key: "notif_ag_planifiee",             label: "Assemblées générales",        desc: "AG planifiées et clôtures de campagne" },
  { key: "notif_message_recu",             label: "Messages reçus",              desc: "Nouveaux messages dans la communication" },
  { key: "notif_budget_depasse",           label: "Budget dépassé",              desc: "Lignes budgétaires dépassées de plus de 10 %" },
  { key: "notif_prix_change",              label: "Changement de prix",          desc: "Modification du prix bord champ" },
];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        checked ? "" : "bg-gray-200"
      }`}
      style={checked ? { backgroundColor: "#1a4731" } : {}}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5 ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function NotificationsPreferencesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: prefs, isLoading } = useGetPreferencesNotifications({
    query: { queryKey: getGetPreferencesNotificationsQueryKey() },
  });

  const update = useUpdatePreferencesNotifications();

  const [form, setForm] = useState<PrefsForm>({
    notif_stock_faible:             true,
    notif_avance_retard:            true,
    notif_creance_retard:           true,
    notif_refus_non_traite:         true,
    notif_anomalie_critique:        true,
    notif_certification_expiration: true,
    notif_echeance_emprunt:         true,
    notif_bulletin_attente:         true,
    notif_ecriture_attente:         true,
    notif_ag_planifiee:             true,
    notif_message_recu:             true,
    notif_budget_depasse:           true,
    notif_prix_change:              true,
    recevoir_sms:                   false,
    recevoir_email:                 false,
  });

  useEffect(() => {
    if (prefs) {
      setForm({
        notif_stock_faible:             prefs.notif_stock_faible ?? true,
        notif_avance_retard:            prefs.notif_avance_retard ?? true,
        notif_creance_retard:           prefs.notif_creance_retard ?? true,
        notif_refus_non_traite:         prefs.notif_refus_non_traite ?? true,
        notif_anomalie_critique:        prefs.notif_anomalie_critique ?? true,
        notif_certification_expiration: prefs.notif_certification_expiration ?? true,
        notif_echeance_emprunt:         prefs.notif_echeance_emprunt ?? true,
        notif_bulletin_attente:         prefs.notif_bulletin_attente ?? true,
        notif_ecriture_attente:         prefs.notif_ecriture_attente ?? true,
        notif_ag_planifiee:             prefs.notif_ag_planifiee ?? true,
        notif_message_recu:             prefs.notif_message_recu ?? true,
        notif_budget_depasse:           prefs.notif_budget_depasse ?? true,
        notif_prix_change:              prefs.notif_prix_change ?? true,
        recevoir_sms:                   prefs.recevoir_sms ?? false,
        recevoir_email:                 prefs.recevoir_email ?? false,
      });
    }
  }, [prefs]);

  function handleSave() {
    update.mutate(
      { data: form },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetPreferencesNotificationsQueryKey() });
          toast({ title: "Préférences sauvegardées", description: "Vos préférences ont été mises à jour." });
        },
        onError: () => {
          toast({ title: "Erreur", description: "Impossible de sauvegarder les préférences.", variant: "destructive" });
        },
      },
    );
  }

  if (isLoading) {
    return <div className="py-20 text-center text-gray-400">Chargement…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Link href="/notifications" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1a4731" }}>
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Préférences de notifications</h1>
            <p className="text-sm text-gray-500">Choisissez quelles alertes recevoir</p>
          </div>
        </div>
      </div>

      {/* Alertes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Types d'alertes</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {NOTIF_LABELS.map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
              <div>
                <p className="text-sm font-medium text-gray-800">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <Toggle
                checked={form[key]}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Canaux */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">Canaux de réception</h2>
        </div>
        <div className="divide-y divide-gray-100">
          <div className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-800">Recevoir par SMS</p>
              <p className="text-xs text-gray-400 mt-0.5">Requiert un numéro de téléphone renseigné</p>
            </div>
            <Toggle
              checked={form.recevoir_sms}
              onChange={(v) => setForm((f) => ({ ...f, recevoir_sms: v }))}
            />
          </div>
          <div className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50">
            <div>
              <p className="text-sm font-medium text-gray-800">Recevoir par email</p>
              <p className="text-xs text-gray-400 mt-0.5">Envoyé à l'adresse email de votre compte</p>
            </div>
            <Toggle
              checked={form.recevoir_email}
              onChange={(v) => setForm((f) => ({ ...f, recevoir_email: v }))}
            />
          </div>
        </div>
      </div>

      {/* Sauvegarder */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={update.isPending}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-60"
          style={{ backgroundColor: "#1a4731" }}
        >
          <Save size={15} />
          {update.isPending ? "Sauvegarde…" : "Sauvegarder"}
        </button>
      </div>
    </div>
  );
}
