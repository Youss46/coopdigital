import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

// ─── API helpers ──────────────────────────────────────────────────────────────
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = async (url: string) => {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ erreur: r.statusText }));
    throw new Error((e as { erreur?: string }).erreur ?? r.statusText);
  }
  return r.json();
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface ArchiveMembreRow {
  id: number; nom: string; prenoms: string; village: string;
  section: string; delegue_nom: string; tonnage_livre_kg: string;
  montant_percu_fcfa: number; score_campagne: string;
  niveau_campagne: string; certifie: boolean;
}
interface ArchiveMembresResponse { membres: ArchiveMembreRow[]; total: number }

interface ArchiveLivraisonRow {
  id: number; date_livraison: string; fournisseur_nom: string;
  fournisseur_type: string; zone: string; delegue_nom: string;
  poids_net_kg: string; prix_unitaire_fcfa: number; montant_net_fcfa: number;
}
interface ArchiveLivraisonsResponse { livraisons: ArchiveLivraisonRow[]; total: number }

interface ArchiveItem {
  id: number;
  campagneId: number;
  tonnageTotalKg: string; caVentesFcfa: string; margeNetteFcfa: string;
  nbMembresActifs: number; pctConformiteEudr: string; checksum: string;
  dateOuverture: string; dateCloture: string; dureeJours: number;
  archivePar: number; dateArchivage: string; versionCoopdigital: string;
  nbLivraisons: number; prixAchatMoyenKgFcfa: string; prixVenteMoyenKgFcfa: string;
  coutAchatsFcfa: string; chargesExploitationFcfa: string; chargesPersonnelFcfa: string;
  margeBruteFcfa: string; margeKgFcfa: string;
  nbMembresTotal: number; nbMembresFemmes: number; nbMembresCertifies: number;
  partsSocialesCollecteesFcfa: string;
  avancesOctroYeesFcfa: string; avancesRembouRseesFcfa: string; intrantsDistribuEsFcfa: string;
  nbLotsTotal: number; nbLotsVendus: number; nbLotsRefoules: number; tonnageRefouleKg: string;
  nbParcellesGps: number;
  campagne: { id: number; libelle: string; anneeDebut: number; anneeFin: number } | null;
}
interface IntegriteResult {
  integre: boolean; checksumStocke: string | null; checksumRecalcule: string;
  dateArchivage: string; archivePar: number;
}
interface ComparaisonItem {
  campagne: { id: number; libelle: string; anneeDebut: number; anneeFin: number } | null;
  archive: ArchiveItem | null;
}

// ─── Formatage ────────────────────────────────────────────────────────────────
const fmtT     = (v: string | number | null | undefined) => `${(Number(v ?? 0)/1000).toFixed(1)} T`;
const fmtM     = (v: string | number | null | undefined) => `${(Number(v ?? 0)/1_000_000).toFixed(1)} M FCFA`;
const fmtK     = (v: string | number | null | undefined) => `${Math.round(Number(v ?? 0)).toLocaleString("fr-FR")} FCFA/kg`;
const fmtPct   = (v: string | number | null | undefined) => `${Number(v ?? 0).toFixed(1)} %`;
const fmtDate  = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("fr-FR") : "—";
const fmtNum   = (v: number | null | undefined) => (v ?? 0).toLocaleString("fr-FR");

// ─── Composants UI simples ────────────────────────────────────────────────────
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors
        ${active ? "bg-emerald-700 text-white" : "text-gray-600 hover:bg-gray-100"}`}
    >
      {children}
    </button>
  );
}

// ─── Onglet 1 — Liste des archives ────────────────────────────────────────────
function OngletListe({
  archives, onConsulter,
}: { archives: ArchiveItem[]; onConsulter: (a: ArchiveItem) => void }) {
  if (archives.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <span className="text-5xl">📁</span>
        <p className="mt-3 text-lg">Aucune campagne archivée</p>
        <p className="text-sm mt-1">Les campagnes apparaissent ici après leur clôture.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {archives.map(a => (
        <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-bold text-gray-900">
                  📦 {a.campagne?.libelle ?? `Campagne ${a.campagneId}`}
                </span>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">
                  ARCHIVÉE
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3">
                {fmtDate(a.dateOuverture)} → {fmtDate(a.dateCloture)} ({a.dureeJours} jours)
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Tonnage collecté</p>
                  <p className="font-semibold text-gray-800">{fmtT(a.tonnageTotalKg)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">CA ventes</p>
                  <p className="font-semibold text-gray-800">{fmtM(a.caVentesFcfa)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Membres actifs</p>
                  <p className="font-semibold text-gray-800">{fmtNum(a.nbMembresActifs)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Marge nette</p>
                  <p className="font-semibold text-emerald-700">{fmtM(a.margeNetteFcfa)}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <IntegriteInline campagneId={a.campagneId} />
              <button
                onClick={() => onConsulter(a)}
                className="px-3 py-1.5 bg-emerald-700 text-white text-sm rounded-lg hover:bg-emerald-800"
              >
                📊 Consulter
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Badge intégrité inline (lazy, au survol / clic)
function IntegriteInline({ campagneId }: { campagneId: number }) {
  const [check, setCheck] = useState(false);
  const { data, isLoading } = useQuery<IntegriteResult>({
    queryKey: ["archive-integrite-inline", campagneId],
    queryFn: () => apiFetch(`/api/archives/${campagneId}/integrite`) as Promise<IntegriteResult>,
    enabled: check,
  });

  if (!check) {
    return (
      <button onClick={() => setCheck(true)} className="text-xs text-gray-400 hover:text-gray-700 underline">
        Vérifier intégrité
      </button>
    );
  }
  if (isLoading) return <span className="text-xs text-gray-400">Vérification…</span>;
  if (!data) return null;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${data.integre ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
      {data.integre ? "✅ Intégrité OK" : "⚠️ Données modifiées"}
    </span>
  );
}

// ─── Onglet 2 — Consulter une campagne ───────────────────────────────────────
function OngletConsulter({ archives, initialCampagneId }: { archives: ArchiveItem[]; initialCampagneId?: number | null }) {
  const [selected, setSelected] = useState<number | null>(initialCampagneId ?? archives[0]?.campagneId ?? null);
  const [subTab, setSubTab] = useState<"resume" | "membres" | "livraisons" | "financier" | "tracabilite">("resume");
  const [searchLiv, setSearchLiv] = useState("");
  const [searchMbr, setSearchMbr] = useState("");

  const archive = archives.find(a => a.campagneId === selected);

  const { data: livraisons, isLoading: loadLiv } = useQuery<ArchiveLivraisonsResponse>({
    queryKey: ["archive-livraisons", selected, searchLiv],
    queryFn: () => apiFetch(`/api/archives/${selected}/livraisons?limit=100&search=${encodeURIComponent(searchLiv)}`),
    enabled: !!selected && subTab === "livraisons",
  });

  const { data: membres, isLoading: loadMbr } = useQuery<ArchiveMembresResponse>({
    queryKey: ["archive-membres", selected, searchMbr],
    queryFn: () => apiFetch(`/api/archives/${selected}/membres?limit=100&search=${encodeURIComponent(searchMbr)}`),
    enabled: !!selected && subTab === "membres",
  });

  if (archives.length === 0) {
    return <div className="text-center py-12 text-gray-400">Aucune campagne archivée disponible.</div>;
  }

  return (
    <div>
      {/* Sélecteur de campagne */}
      <div className="flex items-center gap-3 mb-5">
        <label className="text-sm font-medium text-gray-700">Campagne :</label>
        <select
          value={selected ?? ""}
          onChange={e => { setSelected(Number(e.target.value)); setSubTab("resume"); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
        >
          {archives.map(a => (
            <option key={a.campagneId} value={a.campagneId}>
              {a.campagne?.libelle ?? `Campagne ${a.campagneId}`}
            </option>
          ))}
        </select>
      </div>

      {archive && (
        <>
          {/* Bannière lecture seule */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex items-center gap-3">
            <span className="text-amber-600 text-lg">🔒</span>
            <div>
              <p className="font-semibold text-amber-800 text-sm">
                {archive.campagne?.libelle ?? `Campagne ${archive.campagneId}`} — ARCHIVÉE
              </p>
              <p className="text-xs text-amber-700">
                Données archivées le {fmtDate(archive.dateArchivage)}. Aucune modification possible.
              </p>
            </div>
          </div>

          {/* Sous-onglets */}
          <div className="flex gap-1 mb-5 border-b border-gray-200 pb-2">
            {(["resume","membres","livraisons","financier","tracabilite"] as const).map(t => (
              <TabBtn key={t} active={subTab === t} onClick={() => setSubTab(t)}>
                {{ resume:"📊 Résumé", membres:"👥 Membres", livraisons:"📦 Livraisons", financier:"💰 Financier", tracabilite:"🌿 Traçabilité" }[t]}
              </TabBtn>
            ))}
          </div>

          {/* Résumé */}
          {subTab === "resume" && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <KpiCard label="Tonnage collecté"     value={fmtT(archive.tonnageTotalKg)}        sub={`${fmtNum(archive.nbLivraisons)} livraisons`} />
                <KpiCard label="CA ventes"            value={fmtM(archive.caVentesFcfa)}           sub={`Prix vente moy : ${fmtK(archive.prixVenteMoyenKgFcfa)}`} />
                <KpiCard label="Marge nette"          value={fmtM(archive.margeNetteFcfa)}         sub={`${fmtK(archive.margeKgFcfa)}/kg`} />
                <KpiCard label="Membres actifs"       value={fmtNum(archive.nbMembresActifs)}      sub={`${fmtNum(archive.nbMembresTotal)} membres total`} />
                <KpiCard label="Prix achat moyen"     value={fmtK(archive.prixAchatMoyenKgFcfa)}  />
                <KpiCard label="Durée campagne"       value={`${archive.dureeJours} jours`}        sub={`${fmtDate(archive.dateOuverture)} → ${fmtDate(archive.dateCloture)}`} />
              </div>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 space-y-1">
                <p>Tonnage membres : <strong>{fmtT(archive.tonnageTotalKg)}</strong></p>
                <p>Avances octroyées : <strong>{fmtM(archive.avancesOctroYeesFcfa)}</strong> — Remboursées : <strong>{fmtM(archive.avancesRembouRseesFcfa)}</strong></p>
                <p>Parts sociales collectées : <strong>{fmtM(archive.partsSocialesCollecteesFcfa)}</strong></p>
                <p>Lots vendus : <strong>{fmtNum(archive.nbLotsVendus)}</strong> / {fmtNum(archive.nbLotsTotal)} — Refoulés : <strong>{fmtNum(archive.nbLotsRefoules)}</strong> ({fmtT(archive.tonnageRefouleKg)})</p>
              </div>
            </div>
          )}

          {/* Membres */}
          {subTab === "membres" && (
            <div>
              <input
                value={searchMbr} onChange={e => setSearchMbr(e.target.value)}
                placeholder="Rechercher un producteur…"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full mb-4"
              />
              {loadMbr ? (
                <p className="text-center text-gray-400 py-8">Chargement…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        {["Nom","Village","Section","Délégué","Tonnage","Montant reçu","Score","Certifié"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {membres?.membres?.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-medium">{m.nom} {m.prenoms}</td>
                          <td className="px-3 py-2 text-gray-600">{m.village || "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{m.section || "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{m.delegue_nom || "—"}</td>
                          <td className="px-3 py-2">{fmtT(m.tonnage_livre_kg)}</td>
                          <td className="px-3 py-2">{fmtM(m.montant_percu_fcfa)}</td>
                          <td className="px-3 py-2">
                            {m.score_campagne
                              ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">{Number(m.score_campagne).toFixed(0)} pts — {m.niveau_campagne}</span>
                              : "—"}
                          </td>
                          <td className="px-3 py-2">{m.certifie ? "✅" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {membres?.total != null && (
                    <p className="text-xs text-gray-400 mt-2 text-right">
                      {membres.total} membres — affichage des 100 premiers
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Livraisons */}
          {subTab === "livraisons" && (
            <div>
              <input
                value={searchLiv} onChange={e => setSearchLiv(e.target.value)}
                placeholder="Rechercher un producteur…"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full mb-4"
              />
              {loadLiv ? (
                <p className="text-center text-gray-400 py-8">Chargement…</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        {["Date","Fournisseur","Type","Zone","Délégué","Poids net","Prix/kg","Montant net"].map(h => (
                          <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {livraisons?.livraisons?.map(l => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">{fmtDate(l.date_livraison)}</td>
                          <td className="px-3 py-2 font-medium">{l.fournisseur_nom || "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{l.fournisseur_type || "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{l.zone || "—"}</td>
                          <td className="px-3 py-2 text-gray-600">{l.delegue_nom || "—"}</td>
                          <td className="px-3 py-2">{fmtT(l.poids_net_kg)}</td>
                          <td className="px-3 py-2">{l.prix_unitaire_fcfa?.toLocaleString("fr-FR")} FCFA</td>
                          <td className="px-3 py-2 font-semibold text-emerald-700">
                            {l.montant_net_fcfa?.toLocaleString("fr-FR")} FCFA
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {livraisons?.total != null && (
                    <p className="text-xs text-gray-400 mt-2 text-right">
                      {livraisons.total} livraisons — affichage des 100 premières
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Financier */}
          {subTab === "financier" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Compte de résultat</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { l: "CA Ventes",              v: fmtM(archive.caVentesFcfa),              c: "text-gray-900" },
                      { l: "Coût d'achats",          v: `-${fmtM(archive.coutAchatsFcfa)}`,       c: "text-red-600" },
                      { l: "Marge brute",             v: fmtM(archive.margeBruteFcfa),             c: "font-bold text-gray-900 border-t pt-1" },
                      { l: "Charges exploitation",   v: `-${fmtM(archive.chargesExploitationFcfa)}`, c: "text-red-600" },
                      { l: "Charges personnel",      v: `-${fmtM(archive.chargesPersonnelFcfa)}`, c: "text-red-600" },
                      { l: "Marge nette",            v: fmtM(archive.margeNetteFcfa),             c: "font-bold text-emerald-700 border-t pt-1" },
                    ].map(row => (
                      <div key={row.l} className={`flex justify-between ${row.c}`}>
                        <span>{row.l}</span><span>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700 mb-3 text-sm">Avances & Intrants</h3>
                  <div className="space-y-2 text-sm">
                    {[
                      { l: "Avances octroyées",    v: fmtM(archive.avancesOctroYeesFcfa) },
                      { l: "Avances remboursées",  v: fmtM(archive.avancesRembouRseesFcfa) },
                      { l: "Intrants distribués",  v: fmtM(archive.intrantsDistribuEsFcfa) },
                      { l: "Parts sociales",       v: fmtM(archive.partsSocialesCollecteesFcfa) },
                    ].map(row => (
                      <div key={row.l} className="flex justify-between text-gray-700">
                        <span>{row.l}</span><span className="font-medium">{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-800 font-semibold">Marge / kg</span>
                  <span className="text-2xl font-bold text-emerald-700">{fmtK(archive.margeKgFcfa)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Traçabilité */}
          {subTab === "tracabilite" && (
            <div className="grid grid-cols-2 gap-4">
              <KpiCard label="Parcelles GPS enregistrées" value={fmtNum(archive.nbParcellesGps)} />
              <KpiCard label="Conformité EUDR"            value={fmtPct(archive.pctConformiteEudr)} />
              <KpiCard label="Membres certifiés"          value={fmtNum(archive.nbMembresCertifies)} sub={`sur ${fmtNum(archive.nbMembresTotal)} total`} />
              <KpiCard label="Membres femmes"             value={fmtNum(archive.nbMembresFemmes)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Onglet 3 — Comparaison inter-campagnes ───────────────────────────────────
function OngletComparaison({ archives }: { archives: ArchiveItem[] }) {
  const [selected, setSelected] = useState<number[]>(archives.slice(0, 3).map(a => a.campagneId));

  const toggle = (id: number) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const comparaison = selected
    .map(id => archives.find(a => a.campagneId === id))
    .filter(Boolean) as ArchiveItem[];

  const INDICATEURS: { label: string; key: keyof ArchiveItem; fmt: (v: unknown) => string }[] = [
    { label: "Tonnage (T)",          key: "tonnageTotalKg",        fmt: v => fmtT(v as string) },
    { label: "CA ventes (M FCFA)",   key: "caVentesFcfa",          fmt: v => fmtM(v as string) },
    { label: "Marge nette (M FCFA)", key: "margeNetteFcfa",        fmt: v => fmtM(v as string) },
    { label: "Marge/kg (FCFA)",      key: "margeKgFcfa",           fmt: v => fmtK(v as string) },
    { label: "Membres actifs",       key: "nbMembresActifs",       fmt: v => fmtNum(v as number) },
    { label: "Prix achat moy/kg",    key: "prixAchatMoyenKgFcfa",  fmt: v => fmtK(v as string) },
    { label: "Nb livraisons",        key: "nbLivraisons",          fmt: v => fmtNum(v as number) },
    { label: "% EUDR conforme",      key: "pctConformiteEudr",     fmt: v => fmtPct(v as string) },
  ];

  if (archives.length === 0) {
    return <div className="text-center py-12 text-gray-400">Aucune campagne archivée disponible.</div>;
  }

  return (
    <div>
      {/* Sélection */}
      <div className="flex flex-wrap gap-2 mb-6">
        {archives.map(a => (
          <label key={a.campagneId} className="flex items-center gap-2 cursor-pointer border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50">
            <input
              type="checkbox"
              checked={selected.includes(a.campagneId)}
              onChange={() => toggle(a.campagneId)}
              className="accent-emerald-700"
            />
            <span className="text-sm">{a.campagne?.libelle ?? `Campagne ${a.campagneId}`}</span>
          </label>
        ))}
      </div>

      {comparaison.length === 0 ? (
        <p className="text-center text-gray-400 py-8">Sélectionnez au moins une campagne.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Indicateur</th>
                {comparaison.map(a => (
                  <th key={a.campagneId} className="px-4 py-3 text-center font-medium text-gray-800">
                    {a.campagne?.libelle ?? `C${a.campagneId}`}
                  </th>
                ))}
                {comparaison.length >= 2 && (
                  <th className="px-4 py-3 text-center font-medium text-blue-700">Tendance</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {INDICATEURS.map(ind => {
                const vals = comparaison.map(a => Number(a[ind.key] ?? 0));
                const first = vals[0] ?? 0;
                const last  = vals[vals.length - 1] ?? 0;
                const delta = first > 0 ? ((last - first) / first) * 100 : null;
                return (
                  <tr key={ind.label} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-700">{ind.label}</td>
                    {comparaison.map((a, i) => (
                      <td key={a.campagneId} className={`px-4 py-2.5 text-center ${i === comparaison.length-1 ? "font-semibold text-gray-900" : "text-gray-600"}`}>
                        {ind.fmt(a[ind.key])}
                      </td>
                    ))}
                    {comparaison.length >= 2 && (
                      <td className="px-4 py-2.5 text-center">
                        {delta !== null ? (
                          <span className={`text-xs font-medium ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {delta >= 0 ? "↗" : "↘"} {Math.abs(delta).toFixed(1)}%
                          </span>
                        ) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Onglet 4 — Intégrité & sécurité ─────────────────────────────────────────
function OngletIntegrite({ archives }: { archives: ArchiveItem[] }) {
  const { utilisateur } = useAuth();

  const role = utilisateur?.role ?? "";
  const peutVerifier = ["pca","directeur","auditeur"].includes(role);

  if (!peutVerifier) {
    return (
      <div className="text-center py-12 text-gray-400">
        Accès réservé aux rôles : PCA, Directeur, Auditeur.
      </div>
    );
  }

  if (archives.length === 0) {
    return <div className="text-center py-12 text-gray-400">Aucune campagne archivée.</div>;
  }

  return (
    <div className="space-y-4">
      {archives.map(a => (
        <div key={a.id} className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-gray-800">
                {a.campagne?.libelle ?? `Campagne ${a.campagneId}`}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Archivée le {fmtDate(a.dateArchivage)} · Version CoopDigital {a.versionCoopdigital ?? "—"}
              </p>
              {a.checksum && (
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  SHA-256 : {a.checksum.slice(0, 32)}…
                </p>
              )}
            </div>
            <IntegriteDetail campagneId={a.campagneId} />
          </div>
        </div>
      ))}
    </div>
  );
}

function IntegriteDetail({ campagneId }: { campagneId: number }) {
  const [trigger, setTrigger] = useState(false);
  const { data, isLoading } = useQuery<IntegriteResult>({
    queryKey: ["archive-integrite", campagneId],
    queryFn: () => apiFetch(`/api/archives/${campagneId}/integrite`) as Promise<IntegriteResult>,
    enabled: trigger,
  });

  if (!trigger) {
    return (
      <button
        onClick={() => setTrigger(true)}
        className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-1"
      >
        🔍 Vérifier l'intégrité
      </button>
    );
  }
  if (isLoading) return <span className="text-sm text-gray-400">Vérification en cours…</span>;
  if (!data) return null;

  return (
    <div className="text-right">
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${
        data.integre ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"
      }`}>
        {data.integre ? "✅ Données intègres" : "⚠️ Données modifiées !"}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        Vérifiée maintenant
      </p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
type Tab = "liste" | "consulter" | "comparaison" | "integrite";

export default function ArchivesPage() {
  const [tab, setTab] = useState<Tab>("liste");
  const [consulterCampagneId, setConsulterCampagneId] = useState<number | null>(null);

  const { data: archives = [], isLoading, isError, error, refetch } = useQuery<ArchiveItem[]>({
    queryKey: ["archives"],
    queryFn: () => apiFetch("/api/archives") as Promise<ArchiveItem[]>,
    refetchOnMount: "always",
    retry: 1,
  });

  const TABS: { key: Tab; label: string }[] = [
    { key: "liste",      label: "📁 Campagnes archivées" },
    { key: "consulter",  label: "📊 Consulter" },
    { key: "comparaison",label: "📈 Comparaison" },
    { key: "integrite",  label: "🔐 Intégrité & sécurité" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* En-tête */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Archives des campagnes</h1>
        <p className="text-sm text-gray-500 mt-1">
          {archives.length} campagne{archives.length !== 1 ? "s" : ""} archivée{archives.length !== 1 ? "s" : ""} — Données immuables et consultables en lecture seule
        </p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 pb-2">
        {TABS.map(t => (
          <TabBtn key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </TabBtn>
        ))}
      </div>

      {/* Contenu */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="animate-spin text-3xl mb-3">⏳</div>
          <p>Chargement des archives…</p>
        </div>
      ) : isError ? (
        <div className="text-center py-16">
          <p className="text-red-600 font-medium mb-2">Erreur lors du chargement des archives</p>
          <p className="text-sm text-gray-500 mb-4">{error instanceof Error ? error.message : "Erreur inconnue"}</p>
          <button onClick={() => refetch()} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            Réessayer
          </button>
        </div>
      ) : (
        <>
          {tab === "liste"       && <OngletListe       archives={archives} onConsulter={a => { setConsulterCampagneId(a.campagneId); setTab("consulter"); }} />}
          {tab === "consulter"   && <OngletConsulter   archives={archives} initialCampagneId={consulterCampagneId} />}
          {tab === "comparaison" && <OngletComparaison archives={archives} />}
          {tab === "integrite"   && <OngletIntegrite   archives={archives} />}
        </>
      )}
    </div>
  );
}
