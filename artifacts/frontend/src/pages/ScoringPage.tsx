import { useState } from "react";
import {
  useGetScoringClassement,
  useGetScoringConfig,
  useUpdateScoringConfig,
  useGetScoringTop,
  useGetScoringMembre,
  useGetScoringEvolution,
  usePostScoringRecalculer,
  useGetCampagneActive,
  getGetScoringClassementQueryKey,
  getGetScoringMembreQueryKey,
  type EntreeClassement,
  type ScoreMembreDetail,
} from "@workspace/api-client-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useQueryClient } from "@tanstack/react-query";

// ─── Badge niveau ─────────────────────────────────────────────────────────────
const NIVEAUX: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  platine:    { label: "Platine",    color: "text-purple-700", bg: "bg-purple-100",  emoji: "💎" },
  or:         { label: "Or",         color: "text-yellow-700", bg: "bg-yellow-100",  emoji: "🥇" },
  argent:     { label: "Argent",     color: "text-gray-600",   bg: "bg-gray-100",    emoji: "🥈" },
  bronze:     { label: "Bronze",     color: "text-orange-700", bg: "bg-orange-100",  emoji: "🥉" },
  non_classe: { label: "Non classé", color: "text-slate-500",  bg: "bg-slate-100",   emoji: "📋" },
};

function BadgeNiveau({ niveau }: { niveau: string }) {
  const n = NIVEAUX[niveau] ?? NIVEAUX.non_classe;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${n.bg} ${n.color}`}>
      {n.emoji} {n.label}
    </span>
  );
}

function ScoreBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-yellow-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold w-10 text-right">{Math.round(value)}/100</span>
    </div>
  );
}

// ─── Onglet 1 — Classement ────────────────────────────────────────────────────
function ClassementTab({ campagneId }: { campagneId: number }) {
  const [recherche, setRecherche] = useState("");
  const [filtreNiveau, setFiltreNiveau] = useState("tous");
  const { data: classement, isLoading } = useGetScoringClassement(campagneId);
  const recalc = usePostScoringRecalculer();
  const qc = useQueryClient();

  const liste = (classement ?? []) as EntreeClassement[];
  const filtré = liste.filter(e => {
    const nom = `${e.nom ?? ""} ${e.prenoms ?? ""}`.toLowerCase();
    const ok1 = nom.includes(recherche.toLowerCase());
    const ok2 = filtreNiveau === "tous" || e.niveau === filtreNiveau;
    return ok1 && ok2;
  });

  const top3 = liste.slice(0, 3);
  const podiumOrder = [top3[1], top3[0], top3[2]]; // argent - or - bronze

  const [recalcMsg, setRecalcMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function handleRecalc() {
    setRecalcMsg(null);
    recalc.mutate(
      { data: { campagneId } },
      {
        onSuccess: (data) => {
          const d = data as { calculés?: number };
          qc.invalidateQueries({ queryKey: getGetScoringClassementQueryKey(campagneId) });
          if ((d.calculés ?? 0) === 0) {
            setRecalcMsg({ ok: false, text: "0 membre calculé — vérifiez que des livraisons existent pour cette campagne." });
          } else {
            setRecalcMsg({ ok: true, text: `✓ ${d.calculés} membre(s) recalculé(s) avec succès.` });
          }
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erreur inconnue";
          setRecalcMsg({ ok: false, text: `Erreur : ${msg}` });
        },
      },
    );
  }

  return (
    <div className="space-y-6">
      {/* Podium */}
      {liste.length > 0 && (
        <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-2xl p-6 border border-yellow-200">
          <h3 className="text-center text-sm font-semibold text-yellow-800 uppercase tracking-wider mb-6">
            🏆 Podium Campagne
          </h3>
          <div className="flex items-end justify-center gap-4">
            {podiumOrder.map((e, i) => {
              if (!e) return <div key={i} className="w-28" />;
              const heights = ["h-20", "h-28", "h-16"];
              const rings = ["ring-gray-300", "ring-yellow-400", "ring-orange-400"];
              const emojis = ["🥈", "🥇", "🥉"];
              return (
                <div key={e.membre_id} className="flex flex-col items-center gap-2">
                  <span className="text-2xl">{emojis[i]}</span>
                  <div className={`w-14 h-14 rounded-full bg-white ring-2 ${rings[i]} flex items-center justify-center text-lg font-bold text-gray-700 shadow`}>
                    {String(e.nom ?? "").charAt(0)}{String(e.prenoms ?? "").charAt(0)}
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-semibold text-gray-800 truncate w-24 text-center">
                      {e.prenoms} {e.nom}
                    </div>
                    <div className="text-xs text-gray-500">{Math.round(Number(e.score_global))}/100</div>
                  </div>
                  <div className={`${heights[i]} w-20 rounded-t-lg ${i === 1 ? "bg-yellow-400" : i === 0 ? "bg-gray-300" : "bg-orange-300"} flex items-center justify-center`}>
                    <span className="text-white font-bold text-lg">#{e.rang}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Barre d'outils */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          <input
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un membre…"
            className="border rounded-lg px-3 py-2 text-sm w-52"
          />
          <select
            value={filtreNiveau}
            onChange={e => setFiltreNiveau(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="tous">Tous les niveaux</option>
            <option value="platine">💎 Platine</option>
            <option value="or">🥇 Or</option>
            <option value="argent">🥈 Argent</option>
            <option value="bronze">🥉 Bronze</option>
            <option value="non_classe">Non classé</option>
          </select>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={handleRecalc}
            disabled={recalc.isPending || campagneId === 0}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {recalc.isPending ? "Recalcul en cours…" : "↻ Recalculer maintenant"}
          </button>
          {recalcMsg && (
            <p className={`text-xs px-3 py-1 rounded-lg ${recalcMsg.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {recalcMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Tableau */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : filtré.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {liste.length === 0
            ? "Aucun score calculé pour cette campagne. Cliquez sur « Recalculer »."
            : "Aucun résultat pour ces filtres."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Membre</th>
                <th className="px-4 py-3 text-left">Village</th>
                <th className="px-4 py-3 text-center">Score</th>
                <th className="px-4 py-3 text-center">Niveau</th>
                <th className="px-4 py-3 text-right">Volume (kg)</th>
                <th className="px-4 py-3 text-center">Qualité</th>
                <th className="px-4 py-3 text-center">Régularité</th>
                <th className="px-4 py-3 text-center">Remboursement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtré.map(e => (
                <tr key={e.membre_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-gray-500">#{e.rang ?? "–"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
                        {String(e.nom ?? "").charAt(0)}{String(e.prenoms ?? "").charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{e.prenoms} {e.nom}</div>
                        {e.groupement && <div className="text-xs text-gray-400">{e.groupement}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{e.village ?? "–"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-lg font-bold text-gray-900">{Math.round(Number(e.score_global))}</span>
                    <span className="text-xs text-gray-400">/100</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <BadgeNiveau niveau={e.niveau ?? "non_classe"} />
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {Number(e.tonnage ?? 0).toLocaleString("fr-CI")}
                  </td>
                  <td className="px-4 py-3 text-center">{Math.round(Number(e.score_qualite ?? 0))}</td>
                  <td className="px-4 py-3 text-center">{Math.round(Number(e.score_regularite ?? 0))}</td>
                  <td className="px-4 py-3 text-center">{Math.round(Number(e.score_remboursement ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Onglet 2 — Fiche score membre ───────────────────────────────────────────
function FicheScoreTab({ campagneId }: { campagneId: number }) {
  const { data: classement } = useGetScoringClassement(campagneId);
  const [membreId, setMembreId] = useState<number | null>(null);
  const { data: scoresRaw } = useGetScoringMembre(membreId ?? 0, {
    query: { queryKey: getGetScoringMembreQueryKey(membreId ?? 0), enabled: (membreId ?? 0) > 0 },
  });
  const { data: evolutionRaw } = useGetScoringEvolution(membreId ?? 0, {
    query: { queryKey: ["scoring-evolution", membreId], enabled: (membreId ?? 0) > 0 },
  });

  const scores = scoresRaw as ScoreMembreDetail[] | undefined;
  const dernierScore = scores?.[0];

  const evolution = (evolutionRaw as Array<{
    campagne_id: number; nom_campagne: string; score_global: string; niveau: string; rang: number;
  }> | undefined) ?? [];

  const liste = (classement ?? []) as EntreeClassement[];

  const radarData = dernierScore ? [
    { composante: "Volume",        score: Number(dernierScore.score_volume ?? 0) },
    { composante: "Qualité",       score: Number(dernierScore.score_qualite ?? 0) },
    { composante: "Régularité",    score: Number(dernierScore.score_regularite ?? 0) },
    { composante: "Remboursement", score: Number(dernierScore.score_remboursement ?? 0) },
    { composante: "Fidélité",      score: Number(dernierScore.score_fidelite ?? 0) },
    { composante: "Cotisation",    score: Number(dernierScore.score_cotisation ?? 0) },
  ] : [];

  const scoreGlobal = Math.round(Number(dernierScore?.score_global ?? 0));
  const niveau = dernierScore?.niveau ?? "non_classe";
  const n = NIVEAUX[niveau] ?? NIVEAUX.non_classe;

  const messageNiveau: Record<string, string> = {
    platine:    "🏆 Producteur d'excellence — Priorité avances accordée",
    or:         "⭐ Excellent producteur — Continuez ainsi !",
    argent:     "👍 Bon producteur — Encore un effort sur la régularité",
    bronze:     "📈 En progression — Pensez à livrer plus régulièrement",
    non_classe: "ℹ️ Pas encore classé cette campagne",
  };

  return (
    <div className="space-y-6">
      {/* Sélecteur membre */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Sélectionner un membre</label>
        <select
          value={membreId ?? ""}
          onChange={e => setMembreId(e.target.value ? Number(e.target.value) : null)}
          className="border rounded-lg px-3 py-2 text-sm w-80"
        >
          <option value="">— Choisir un membre —</option>
          {liste.map(e => (
            <option key={e.membre_id} value={e.membre_id}>
              #{e.rang ?? "?"} {e.prenoms} {e.nom} — {Math.round(Number(e.score_global))}/100
            </option>
          ))}
        </select>
      </div>

      {!membreId ? (
        <div className="text-center py-16 text-gray-400">
          Sélectionnez un membre pour afficher sa fiche score.
        </div>
      ) : !dernierScore ? (
        <div className="text-center py-16 text-gray-400">Aucun score calculé pour ce membre.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Score global */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6 flex flex-col items-center gap-4">
            <div className={`w-32 h-32 rounded-full ${n.bg} ring-4 ring-offset-2 ring-current ${n.color} flex flex-col items-center justify-center`}>
              <span className="text-4xl">{n.emoji}</span>
              <span className="text-2xl font-black text-gray-900">{scoreGlobal}</span>
              <span className="text-xs text-gray-500">/100</span>
            </div>
            <BadgeNiveau niveau={niveau} />
            <div className="text-center text-sm text-gray-600 bg-gray-50 rounded-xl px-4 py-2 max-w-xs">
              {messageNiveau[niveau]}
            </div>
            {dernierScore.rang && (
              <div className="text-xs text-gray-500">
                Rang #{dernierScore.rang} dans la campagne {dernierScore.nom_campagne}
              </div>
            )}
          </div>

          {/* Radar chart */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Radar des composantes</h3>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="composante" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} />
                <Radar dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Détail composantes */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Détail des composantes</h3>
            <div className="space-y-4">
              {[
                { label: "Volume livraisons",  score: Number(dernierScore.score_volume ?? 0),         poids: "30%" },
                { label: "Qualité",            score: Number(dernierScore.score_qualite ?? 0),        poids: "25%" },
                { label: "Régularité",         score: Number(dernierScore.score_regularite ?? 0),     poids: "20%" },
                { label: "Remboursement",      score: Number(dernierScore.score_remboursement ?? 0),  poids: "15%" },
                { label: "Fidélité",           score: Number(dernierScore.score_fidelite ?? 0),       poids: "5%"  },
                { label: "Cotisation",         score: Number(dernierScore.score_cotisation ?? 0),     poids: "5%"  },
              ].map(c => (
                <div key={c.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium text-gray-700">{c.label}</span>
                    <span className="text-gray-400">Poids {c.poids}</span>
                  </div>
                  <ScoreBar value={c.score} />
                </div>
              ))}
            </div>
          </div>

          {/* Évolution */}
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Évolution du score</h3>
            {evolution.length < 2 ? (
              <div className="text-sm text-gray-400 text-center py-8">
                Pas assez de données historiques.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={evolution.slice().reverse()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="nom_campagne" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${Math.round(v)}/100`, "Score"]} />
                  <Line type="monotone" dataKey="score_global" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet 3 — Configuration ─────────────────────────────────────────────────
function ConfigTab({ campagneId }: { campagneId: number }) {
  const { data: cfg, isLoading } = useGetScoringConfig();
  const update = useUpdateScoringConfig();
  const recalc = usePostScoringRecalculer();
  const qc = useQueryClient();

  const [poids, setPoids] = useState({
    volume: 30, qualite: 25, regularite: 20, remboursement: 15, fidelite: 5, cotisation: 5,
  });
  const [seuils, setSeuils] = useState({ bronze: 40, argent: 60, or: 75, platine: 90 });
  const [avantages, setAvantages] = useState({ bronze: "", argent: "", or: "", platine: "" });
  const [loaded, setLoaded] = useState(false);

  if (cfg && !loaded) {
    const c = cfg as {
      poidsVolumePct: string; poidsQualitePct: string; poidsRegularitePct: string;
      poidsRemboursementPct: string; poidsFidelitePct: string; poidsCotisationPct: string;
      seuilBronze: string; seuilArgent: string; seuilOr: string; seuilPlatine: string;
      avantagesBronze: string; avantagesArgent: string; avantagesOr: string; avantagesPlatine: string;
      updatedAt: string;
    };
    setPoids({
      volume:        Number(c.poidsVolumePct),
      qualite:       Number(c.poidsQualitePct),
      regularite:    Number(c.poidsRegularitePct),
      remboursement: Number(c.poidsRemboursementPct),
      fidelite:      Number(c.poidsFidelitePct),
      cotisation:    Number(c.poidsCotisationPct),
    });
    setSeuils({
      bronze:  Number(c.seuilBronze),
      argent:  Number(c.seuilArgent),
      or:      Number(c.seuilOr),
      platine: Number(c.seuilPlatine),
    });
    setAvantages({
      bronze:  c.avantagesBronze ?? "",
      argent:  c.avantagesArgent ?? "",
      or:      c.avantagesOr ?? "",
      platine: c.avantagesPlatine ?? "",
    });
    setLoaded(true);
  }

  const totalPoids = Object.values(poids).reduce((a, b) => a + b, 0);
  const poidsOk = Math.abs(totalPoids - 100) < 0.5;

  function handleSave() {
    update.mutate({
      data: {
        poidsVolumePct:        poids.volume,
        poidsQualitePct:       poids.qualite,
        poidsRegularitePct:    poids.regularite,
        poidsRemboursementPct: poids.remboursement,
        poidsFidelitePct:      poids.fidelite,
        poidsCotisationPct:    poids.cotisation,
        seuilBronze:  seuils.bronze,
        seuilArgent:  seuils.argent,
        seuilOr:      seuils.or,
        seuilPlatine: seuils.platine,
        avantagesBronze:  avantages.bronze,
        avantagesArgent:  avantages.argent,
        avantagesOr:      avantages.or,
        avantagesPlatine: avantages.platine,
      },
    });
  }

  function handleRecalc() {
    recalc.mutate(
      { data: { campagneId } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: ["scoring"] }) },
    );
  }

  if (isLoading) return <div className="text-center py-12 text-gray-400">Chargement…</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Poids */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Poids des composantes</h3>
        <div className="space-y-4">
          {([
            ["volume",        "Volume livraisons",  "bg-blue-500"],
            ["qualite",       "Qualité",             "bg-emerald-500"],
            ["regularite",    "Régularité",          "bg-indigo-500"],
            ["remboursement", "Remboursement",       "bg-orange-500"],
            ["fidelite",      "Fidélité",            "bg-pink-500"],
            ["cotisation",    "Cotisation",          "bg-purple-500"],
          ] as [keyof typeof poids, string, string][]).map(([key, label, color]) => (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-medium text-gray-700">{label}</span>
                <span className={`font-bold ${color.replace("bg-", "text-")}`}>{poids[key]}%</span>
              </div>
              <input
                type="range" min={0} max={100} step={1}
                value={poids[key]}
                onChange={e => setPoids(p => ({ ...p, [key]: Number(e.target.value) }))}
                className="w-full accent-indigo-500"
              />
            </div>
          ))}
        </div>
        <div className={`mt-4 text-sm font-semibold ${poidsOk ? "text-emerald-600" : "text-red-500"}`}>
          Total : {totalPoids}% {poidsOk ? "✓" : "⚠ doit être 100%"}
        </div>
      </div>

      {/* Seuils + avantages */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Seuils des niveaux</h3>
          <div className="space-y-3">
            {([
              ["bronze",  "🥉 Bronze",  "text-orange-600"],
              ["argent",  "🥈 Argent",  "text-gray-600"],
              ["or",      "🥇 Or",      "text-yellow-600"],
              ["platine", "💎 Platine", "text-purple-600"],
            ] as [keyof typeof seuils, string, string][]).map(([key, label, color]) => (
              <div key={key} className="flex items-center gap-3">
                <span className={`text-sm font-medium ${color} w-24`}>{label}</span>
                <input
                  type="number" min={0} max={100}
                  value={seuils[key]}
                  onChange={e => setSeuils(s => ({ ...s, [key]: Number(e.target.value) }))}
                  className="border rounded px-2 py-1 text-sm w-20"
                />
                <span className="text-xs text-gray-400">points min.</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Avantages par niveau</h3>
          <div className="space-y-3">
            {([
              ["bronze",  "🥉 Bronze"],
              ["argent",  "🥈 Argent"],
              ["or",      "🥇 Or"],
              ["platine", "💎 Platine"],
            ] as [keyof typeof avantages, string][]).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                <input
                  value={avantages[key]}
                  onChange={e => setAvantages(a => ({ ...a, [key]: e.target.value }))}
                  className="w-full border rounded px-3 py-1.5 text-sm"
                  placeholder="Description des avantages…"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="lg:col-span-2 flex flex-wrap gap-3 justify-between items-center bg-gray-50 rounded-xl p-4 border border-gray-200">
        <div className="text-xs text-gray-500">
          {(cfg as { updatedAt?: string } | undefined)?.updatedAt && (
            <>Dernière mise à jour : {new Date((cfg as { updatedAt: string }).updatedAt).toLocaleString("fr-CI")}</>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRecalc}
            disabled={recalc.isPending}
            className="border border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {recalc.isPending ? "Recalcul…" : "↻ Recalculer tous les scores"}
          </button>
          <button
            onClick={handleSave}
            disabled={!poidsOk || update.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {update.isPending ? "Enregistrement…" : "Enregistrer la configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
const TABS = [
  { id: "classement", label: "🏆 Classement général" },
  { id: "fiche",      label: "👤 Fiche score" },
  { id: "config",     label: "⚙️ Configuration" },
];

export default function ScoringPage() {
  const [tab, setTab] = useState("classement");
  const { data: campagne } = useGetCampagneActive();
  const campagneId = (campagne as { id?: number } | undefined)?.id ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scoring Producteurs</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Classement et analyse de performance des membres
            {campagne && (
              <span className="ml-2 text-indigo-600 font-medium">
                — Campagne {(campagne as { anneeDebut?: number; anneeFin?: number }).anneeDebut}/{(campagne as { anneeDebut?: number; anneeFin?: number }).anneeFin}
              </span>
            )}
          </p>
        </div>
        {campagneId === 0 && (
          <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
            ⚠️ Aucune campagne active
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu */}
      {tab === "classement" && <ClassementTab campagneId={campagneId} />}
      {tab === "fiche"      && <FicheScoreTab campagneId={campagneId} />}
      {tab === "config"     && <ConfigTab     campagneId={campagneId} />}
    </div>
  );
}
