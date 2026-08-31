import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Loader2, CheckCircle2, Scale, Package,
  Truck, Plus, Trash2, CheckCheck, X, AlertTriangle,
  WifiOff,
} from "lucide-react";
import FournisseurSearch from "../components/FournisseurSearch";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavPeseur from "../components/BottomNavPeseur";
import ScaleWeightDisplay from "../components/ScaleWeightDisplay";
import { NumericInput } from "../components/ui/numeric-input";
import { useOffline } from "../contexts/OfflineContext";
import { useAuth } from "../contexts/AuthContext";
import {
  createSessionPesee,
  getSessionsEnCours,
  getSessionDetail,
  addLignePesee,
  deleteLignePesee,
  terminerSessionPesee,
  annulerSessionPesee,
  convertirSessionEnLivraison,
  telechargerRecuLivraison,
  telechargerBordereauSession,
  SessionEnCoursError,
  getPrix,
  getFournisseurRecap,
  getAvancesDeleguesTerrain,
  patchPlanAvanceDeleague,
  patchPlanAvanceMembre,
} from "../lib/api";
import type { Fournisseur, SessionDetail, ConversionLivraisonResult, BrouillonPesee } from "../lib/types";
import {
  createBrouillon,
  getBrouillon,
  addLigneToBrouillon,
  deleteLigneFromBrouillon,
  terminerBrouillon as terminerBrouillonIDB,
  annulerBrouillon,
} from "../lib/idb";
import type { AvanceDeleagueTerrain } from "../lib/api";
import {
  getFournisseurForSession,
  isIncompleteMemberDelegateSession,
  tareFromNombreSacs,
} from "../lib/sessionPesee";

type Step = "membre" | "certif" | "session" | "succes";

function RecuLivraisonButton({ livraisonId }: { livraisonId: number }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="t-btn t-btn--ghost"
      style={{ width: "100%", marginBottom: 10 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try { await telechargerRecuLivraison(livraisonId); }
        catch { /* silencieux */ }
        finally { setLoading(false); }
      }}
    >
      {loading ? "Génération…" : "📄 Télécharger le reçu PDF"}
    </button>
  );
}

function RecuButton({ livraisonId }: { livraisonId: number }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="t-btn t-btn--ghost"
      style={{ width: "100%", marginBottom: 10 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try { await telechargerRecuLivraison(livraisonId); }
        catch { /* silencieux */ }
        finally { setLoading(false); }
      }}
    >
      {loading ? "Génération…" : "🧾 Télécharger le reçu PDF"}
    </button>
  );
}

function BordereauSessionButton({ sessionId }: { sessionId: number }) {
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <>
      <button
        className="t-btn t-btn--ghost"
        style={{ width: "100%", marginBottom: 10, borderColor: "#1a4731", color: "#1a4731" }}
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setErreur(null);
          try { await telechargerBordereauSession(sessionId); }
          catch (e) { setErreur((e as Error).message); }
          finally { setLoading(false); }
        }}
      >
        {loading ? "Génération…" : "📋 Bordereau de réception"}
      </button>
      {erreur && (
        <div style={{ fontSize: ".75rem", color: "#ef4444", marginTop: -6, marginBottom: 10, textAlign: "center" }}>
          {erreur}
        </div>
      )}
    </>
  );
}

function fmtPoids(kg: number): string {
  if (kg >= 1000) return (kg / 1000).toFixed(3) + " T";
  return kg.toFixed(3) + " kg";
}

export default function SessionPeseeFlow({ params }: { params?: { sessionId?: string } }) {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const { user } = useAuth();
  const machinePeseeObligatoire = user?.machinePeseeObligatoire === true;
  const isPeseurCentral = user?.role === "peseur" && user.delegueId == null;

  const [step, setStep] = useState<Step>("membre");
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [sessionTerminee, setSessionTerminee] = useState<SessionDetail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonPesee | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);

  // Formulaire nouvelle pesée
  const [nbSacs, setNbSacs] = useState("");
  const [poidsBrut, setPoidsBrut] = useState("");
  const [scaleConnected, setScaleConnected] = useState(false);
  const [tare, setTare] = useState("0");
  const [notesLigne, setNotesLigne] = useState("");
  const [certificationCacao, setCertificationCacao] = useState<string>("");
  const [ajoutLoading, setAjoutLoading] = useState(false);
  const [terminerLoading, setTerminerLoading] = useState(false);
  const [annulerLoading, setAnnulerLoading] = useState(false);
  const [erreur, setErreur] = useState("");
  const [confirmAnnuler, setConfirmAnnuler] = useState(false);
  const [confirmTerminer, setConfirmTerminer] = useState(false);
  const [confirmConvertir, setConfirmConvertir] = useState(false);
  const [convertirLoading, setConvertirLoading] = useState(false);
  const [livraisonResult, setLivraisonResult] = useState<ConversionLivraisonResult | null>(null);
  // Synchronous guard — prevents a second tap from entering handleConvertir before the first resolves
  const convertirInProgressRef = useRef(false);

  // Avances du délégué — chargées après clôture de la session, avant conversion
  const [avancesDelegue, setAvancesDelegue] = useState<AvanceDeleagueTerrain[]>([]);
  const [avancesLoading, setAvancesLoading] = useState(false);
  // Éditions en cours par avance : avanceId → { planType, montantPartiel, reportDate }
  const [avancePlanEdits, setAvancePlanEdits] = useState<Record<number, { planType: string; montantPartiel: string; reportDate: string }>>({});
  const [plansSaving, setPlansSaving] = useState(false);
  const nbSacsNum = Number(nbSacs);
  const nbSacsInvalide = !Number.isSafeInteger(nbSacsNum) || nbSacsNum <= 0;
  const [plansSaved, setPlansSaved] = useState(false);

  // Estimation avant conversion
  const [estimeLoading, setEstimeLoading] = useState(false);
  const [estimePrixUnitaire, setEstimePrixUnitaire] = useState<number | null>(null);
  const [estimeAvance, setEstimeAvance] = useState<number>(0);
  const [estimeIntrants, setEstimeIntrants] = useState<number>(0);
  const poidsSessionTerminee = parseFloat(String(sessionTerminee?.poidsTotalKg ?? 0));
  const sessionConvertible = Number.isFinite(poidsSessionTerminee) && poidsSessionTerminee > 0;

  // Map membreId → sessionId pour les sessions actives (badge + reprise directe)
  // Rafraîchie toutes les 30 s tant que l'écran de sélection du membre est visible.
  const [activeSessions, setActiveSessions] = useState<Map<number, number>>(new Map());
  const sessionMembreDelegueIncomplete = isIncompleteMemberDelegateSession(session);
  const sessionSaisissable = session?.statut === "en_cours";
  const poidsSaisieVerrouillee = machinePeseeObligatoire || scaleConnected;

  // Une session peut changer de statut après son chargement (annulation depuis
  // un autre appareil, cron d'expiration, etc.). Ne jamais laisser le
  // formulaire de saisie affiché dans cet état devenu inactif.
  useEffect(() => {
    if (step !== "session" || !session || session.statut === "en_cours") return;

    if (session.statut === "terminee") {
      setSessionTerminee(session);
      setSession(null);
      setStep("succes");
      return;
    }

    quitterSessionAnnulee(session);
  }, [session?.id, session?.statut, step]);

  useEffect(() => {
    if (!isOnline || step !== "membre") return;

    function refresh() {
      getSessionsEnCours().then((sessions) => {
        const map = new Map<number, number>();
        for (const s of sessions) {
          if (s.membreId !== null && s.id !== undefined) map.set(s.membreId, s.id);
          // Les fournisseurs externes utilisent un namespace décalé pour éviter les collisions d'ID
          if (s.fournisseurId && s.id !== undefined) map.set(-s.fournisseurId, s.id);
        }
        setActiveSessions(map);
      }).catch(() => { /* silencieux */ });
    }

    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [isOnline, step]);

  // Reprise directe depuis l'accueil via /pesee-session/:sessionId (ou /pesee-session/b-<localId> pour brouillon)
  useEffect(() => {
    const rawId = params?.sessionId;
    if (!rawId) return;

    // Reprise d'un brouillon hors-ligne : URL /pesee-session/b-<localId>
    if (rawId.startsWith("b-")) {
      const localId = rawId.slice(2);
      setResumeLoading(true);
      (async () => {
        try {
          const b = await getBrouillon(localId);
          if (b) {
            setFournisseur({
              id: b.membreId, code: b.membreCode, nom: b.membreNom, prenoms: b.membrePrenoms,
              telephone: "", section: null, village: null, typeMembre: "membre",
              avanceEnCours: 0, intrantsDus: 0, derniereLivraison: null,
            });
            setBrouillon(b);
            const synth = brouillonToSyntheticSession(b);
            if (b.statut === "terminee") { setSessionTerminee(synth); setStep("succes"); }
            else { setSession(synth); setStep("session"); }
          }
        } catch { /* silencieux */ } finally { setResumeLoading(false); }
      })();
      return;
    }

    if (!isOnline) return;
    const sessionId = parseInt(rawId, 10);
    if (isNaN(sessionId)) return;
    setResumeLoading(true);
    (async () => {
      try {
        const detail = await getSessionDetail(sessionId);
        // Remplace aussi le membre précédent par null pour les sessions sans membre.
        setFournisseur(getFournisseurForSession(detail));
        if (detail.statut === "terminee") {
          // Session clôturée — aller directement à l'écran de succès pour permettre la conversion
          setSessionTerminee(detail);
          setStep("succes");
        } else if (detail.statut === "annulee") {
          // Ne jamais afficher le formulaire de saisie pour une session annulée.
          // Le bon associé peut être redémarré depuis l'écran Réceptions.
          setSession(null);
          setErreur("Cette session a été annulée. Retournez à la réception pour démarrer une nouvelle pesée.");
          setStep("membre");
        } else {
          setSession(detail);
          setStep("session");
        }
      } catch {
        // Silencieux — retombe sur le step "membre"
      } finally {
        setResumeLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.sessionId, isOnline]);

  // Reprise de session en cours pour ce membre
  useEffect(() => {
    if (!fournisseur || !isOnline) return;
    (async () => {
      try {
        const sessions = await getSessionsEnCours(fournisseur.id);
        if (sessions.length > 0) {
          const existing = sessions[0]!;
          // Charger le détail complet
          const { getSessionDetail: fetchDetail } = await import("../lib/api");
          const detail = await fetchDetail(existing.id);
          setSession(detail);
        }
      } catch {
        // Pas de session en cours — normal
      }
    })();
  }, [fournisseur, isOnline]);

  // ── Reprise directe depuis le badge "Session en cours" ────────────────────
  async function handleSelectActiveSession(f: Fournisseur, sessionId: number) {
    if (isPeseurCentral && f.isMembreDelegue) {
      setLocation(`/receptions?membreDelegueId=${f.id}`);
      return;
    }
    setFournisseur(f);
    setErreur("");
    if (!isOnline) { setErreur("La pesée groupée requiert une connexion internet"); return; }
    try {
      const detail = await getSessionDetail(sessionId);
      setSession(detail);
      setStep("session");
    } catch {
      // Session clôturée ou expirée entre-temps — reprendre le chemin normal
      await handleSelectMembre(f);
    }
  }

  // ── Brouillon → SessionDetail synthétique ─────────────────────────────────
  function brouillonToSyntheticSession(b: BrouillonPesee): SessionDetail {
    return {
      id: -1,
      cooperativeId: 0,
      peseurId: null,
      numeroSession: "📴 Hors ligne",
      membreId: b.membreId,
      membreNom: b.membreNom,
      membrePrenoms: b.membrePrenoms,
      produit: b.produit,
      operation: b.operation,
      certificationCacao: b.certificationCacao,
      statut: b.statut === "annulee" ? "annulee" : b.statut === "terminee" ? "terminee" : "en_cours",
      poidsTotalKg: String(b.poidsTotalKg.toFixed(3)),
      nbSacsTotal: b.nbSacsTotal,
      dateDebut: new Date(b.createdAt).toISOString(),
      dateFin: b.statut === "terminee" ? new Date(b.updatedAt).toISOString() : null,
      notes: null,
      livraisonId: null,
      transfertId: null,
      createdAt: new Date(b.createdAt).toISOString(),
      lignes: b.lignes.map((l, idx) => ({
        id: idx + 1,
        sessionId: -1,
        numeroPassage: l.numeroPassage,
        nbSacs: l.nbSacs,
        poidsBrutKg: String(l.poidsBrutKg),
        tareKg: String(l.tareKg),
        notes: l.notes ?? null,
        createdAt: new Date(l.timestamp).toISOString(),
      })),
    };
  }

  // ── Sélection du membre (chemin standard) ─────────────────────────────────
  // Si une session active existe déjà → reprendre directement.
  // Sinon → passer par l'étape "certif" pour déclarer le type de cacao avant création.
  async function handleSelectMembre(f: Fournisseur) {
    if (isPeseurCentral && f.isMembreDelegue) {
      setLocation(`/receptions?membreDelegueId=${f.id}`);
      return;
    }
    setFournisseur(f);
    setErreur("");
    setCertificationCacao("");

    if (!isOnline) {
      // Mode hors ligne → aller à l'étape certif avant de créer le brouillon
      setStep("certif");
      return;
    }

    try {
      // Chemin rapide : sessionId déjà connu dans le cache local
      const cacheKey = f.typeMembre === "externe" ? -f.id : f.id;
      const knownId = activeSessions.get(cacheKey);
      if (knownId !== undefined) {
        try {
          const detail = await getSessionDetail(knownId);
          setSession(detail);
          setStep("session");
          return;
        } catch {
          // Session expirée/annulée — continuer vers le chemin complet
        }
      }

      // Chemin complet : vérification API
      const isExterne = f.typeMembre === "externe";
      const sessions = isExterne
        ? await getSessionsEnCours(undefined, f.id)
        : await getSessionsEnCours(f.id);
      if (sessions.length > 0) {
        // Session existante → reprendre sans passer par certif
        const detail = await getSessionDetail(sessions[0]!.id);
        setSession(detail);
        setStep("session");
      } else {
        // Nouvelle session → déclarer le type de cacao d'abord
        setStep("certif");
      }
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  // ── Confirmation de la certification + création de session ─────────────────
  async function handleConfirmerCertif() {
    if (!fournisseur) return;
    setErreur("");
    if (!certificationCacao) {
      setErreur("Sélectionnez le type de certification du cacao avant de commencer la pesée.");
      return;
    }

    if (!isOnline) {
      try {
        const newBrouillon = await createBrouillon({
          membreId: fournisseur.id, membreNom: fournisseur.nom, membrePrenoms: fournisseur.prenoms,
          membreCode: fournisseur.code, produit: "cacao", operation: "reception", certificationCacao,
        });
        setBrouillon(newBrouillon);
        setSession(brouillonToSyntheticSession(newBrouillon));
        setStep("session");
      } catch (err) {
        setErreur((err as Error).message);
      }
      return;
    }

    try {
      const isExterne = fournisseur.typeMembre === "externe";
      const sessionPayload = isExterne
        ? { fournisseurId: fournisseur.id, produit: "cacao", operation: "reception", certificationCacao }
        : { membreId: fournisseur.id, produit: "cacao", operation: "reception", certificationCacao };
      const s = await createSessionPesee(sessionPayload);
      const detail = await getSessionDetail(s.id);
      setSession(detail);
      setStep("session");
    } catch (createErr) {
      if (createErr instanceof SessionEnCoursError) {
        const detail = await getSessionDetail(createErr.sessionId);
        setSession(detail);
        setStep("session");
      } else {
        setErreur((createErr as Error).message);
      }
    }
  }

  // ── Ajouter une ligne ──────────────────────────────────────────────────────
  async function handleAjouterLigne() {
    if (nbSacsInvalide) {
      setErreur("Le nombre de sacs est obligatoire et doit être supérieur à zéro.");
      return;
    }
    if (!session || !poidsBrut) return;
    if (session.statut !== "en_cours") {
      if (session.statut === "terminee") {
        setSessionTerminee(session);
        setSession(null);
        setStep("succes");
      } else {
        quitterSessionAnnulee(session);
      }
      return;
    }
    const poidsNum = parseFloat(poidsBrut);
    if (isNaN(poidsNum) || poidsNum <= 0) { setErreur("Poids invalide"); return; }
    setAjoutLoading(true);
    setErreur("");
    try {
      if (brouillon) {
        // Mode hors ligne : ajouter la ligne dans le brouillon local
        const updated = await addLigneToBrouillon(brouillon.localId, {
          nbSacs: nbSacsNum,
          poidsBrutKg: poidsNum,
          tareKg: parseFloat(tare) || 0,
          notes: notesLigne || undefined,
        });
        setBrouillon(updated);
        setSession(brouillonToSyntheticSession(updated));
      } else {
        const updated = await addLignePesee(session.id, {
          nbSacs: nbSacsNum,
          poidsBrutKg: poidsNum,
          tareKg: parseFloat(tare) || 0,
          notes: notesLigne || undefined,
        });
        setSession(updated);
      }
      // Reset form
      setNbSacs("");
      setPoidsBrut("");
      setTare("0");
      setNotesLigne("");
    } catch (err) {
      const message = (err as Error).message;
      // Une clôture peut avoir gagné une course réseau juste avant cet envoi.
      // Recharger alors l'état réel plutôt que laisser le peseur sur un
      // formulaire devenu inutilisable.
      if (!brouillon && /session déjà terminée|session déjà annulée/i.test(message)) {
        try {
          const refreshed = await getSessionDetail(session.id);
          if (refreshed.statut === "terminee") {
            setSessionTerminee(refreshed);
            setSession(null);
            setStep("succes");
            return;
          }
          // Le serveur vient de refuser l'ajout comme session terminée ou
          // annulée. Ne pas rediriger silencieusement vers Réceptions :
          // l'opérateur doit voir la raison du refus, y compris si le GET
          // concurrent retourne encore en_cours.
          if (refreshed.statut === "annulee") {
            const isReception =
              refreshed.operation === "reception_membre_delegue" ||
              refreshed.operation === "reception_transfert";
            quitterSessionSansNavigation(
              isReception
                ? "Cette session a été annulée. Retournez à l'écran Réceptions pour démarrer une nouvelle pesée."
                : "Cette session a expiré ou a été annulée. Sélectionnez à nouveau le planteur pour démarrer une nouvelle pesée.",
            );
          } else {
            quitterSessionSansNavigation(message);
          }
          return;
        } catch {
          // La session est inactive d'après l'API, mais son état détaillé
          // n'est momentanément pas lisible. Garder l'erreur visible au lieu
          // de renvoyer l'opérateur à une autre page sans explication.
          quitterSessionSansNavigation(message);
          return;
        }
      }
      setErreur(message);
    } finally {
      setAjoutLoading(false);
    }
  }

  // ── Supprimer une ligne ────────────────────────────────────────────────────
  async function handleSupprimerLigne(ligneId: number) {
    if (brouillon) {
      // ligneId est l'index 1-based de la ligne dans le brouillon
      const ligne = brouillon.lignes[ligneId - 1];
      if (!ligne) return;
      try {
        const updated = await deleteLigneFromBrouillon(brouillon.localId, ligne.localId);
        setBrouillon(updated);
        setSession(brouillonToSyntheticSession(updated));
      } catch (err) {
        setErreur((err as Error).message);
      }
      return;
    }
    if (!session) return;
    try {
      const updated = await deleteLignePesee(session.id, ligneId);
      setSession(updated);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  // ── Terminer la session ────────────────────────────────────────────────────
  async function handleTerminer() {
    setTerminerLoading(true);
    setErreur("");
    if (brouillon) {
      try {
        const updated = await terminerBrouillonIDB(brouillon.localId);
        setBrouillon(updated);
        const synth = brouillonToSyntheticSession(updated);
        setSessionTerminee(synth);
        setStep("succes");
      } catch (err) {
        setErreur((err as Error).message);
      } finally {
        setTerminerLoading(false);
        setConfirmTerminer(false);
      }
      return;
    }
    if (!session) { setTerminerLoading(false); return; }
    try {
      const closed = await terminerSessionPesee(session.id);
      setSessionTerminee(closed);
      setStep("succes");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setTerminerLoading(false);
      setConfirmTerminer(false);
    }
  }

  // ── Annuler la session ─────────────────────────────────────────────────────
  async function handleAnnuler() {
    if (brouillon) {
      try { await annulerBrouillon(brouillon.localId); } catch { /* silencieux */ }
      quitterSessionAnnulee();
      return;
    }
    if (!session) return;
    setAnnulerLoading(true);
    try {
      await annulerSessionPesee(session.id);
      quitterSessionAnnulee(session);
    } catch (err) {
      const message = (err as Error).message;
      // Si une autre action a déjà annulé ou clôturé cette session, le résultat
      // attendu reste de quitter ce formulaire devenu inutilisable.
      if (/session déjà terminée|session déjà annulée/i.test(message)) {
        quitterSessionAnnulee(session);
      } else {
        setErreur(message);
        setAnnulerLoading(false);
        setConfirmAnnuler(false);
      }
    }
  }

  // ── Ouvrir le modal de conversion (et pré-charger l'estimation) ───────────
  async function ouvrirConvertirModal() {
    if (!sessionConvertible) {
      setErreur("Impossible de créer une livraison : cette session ne contient aucune pesée valide. Enregistrez au moins un passage avec un poids net supérieur à 0 kg.");
      return;
    }
    setConfirmConvertir(true);
    setEstimePrixUnitaire(null);
    setEstimeAvance(fournisseur?.avanceEnCours ?? 0);
    setEstimeIntrants(fournisseur?.intrantsDus ?? 0);
    setEstimeLoading(true);
    try {
      const membreId = sessionTerminee?.membreId ?? fournisseur?.id;
      const [prixData, recapData] = await Promise.all([
        getPrix(),
        membreId ? getFournisseurRecap(membreId).catch(() => null) : Promise.resolve(null),
      ]);
      setEstimePrixUnitaire(prixData.prixBordChampFcfa);
      if (recapData) {
        setEstimeAvance(recapData.avanceEnCours);
        setEstimeIntrants(recapData.intrantsDus);
      }
    } catch {
      // Silencieux — l'estimation restera null, on masque juste le bloc
    } finally {
      setEstimeLoading(false);
    }
  }

  // ── Convertir la session terminée en livraison ─────────────────────────────
  async function handleConvertir() {
    if (!sessionTerminee) return;
    if (!sessionConvertible) {
      setErreur("Impossible de créer une livraison : le poids total de la session doit être supérieur à 0 kg.");
      return;
    }
    // Synchronous guard: block any second invocation until the first resolves.
    // State-based guards (convertirLoading) are insufficient on mobile because
    // React may not re-render between two rapid taps.
    if (convertirInProgressRef.current) return;
    convertirInProgressRef.current = true;
    // Keep a local snapshot: converting a completed session must never replace
    // its validated passages with an empty recap while the request is in flight.
    const sessionAvantConversion = sessionTerminee;

    setConvertirLoading(true);
    setErreur("");
    try {
      const result = await convertirSessionEnLivraison(sessionTerminee.id);
      setSessionTerminee((current) => {
        const poidsActuel = parseFloat(String(current?.poidsTotalKg ?? 0));
        const sessionValide = Number.isFinite(poidsActuel) && poidsActuel > 0;
        return {
          ...(sessionValide && current ? current : sessionAvantConversion),
          livraisonId: result.livraisonId,
        };
      });
      setLivraisonResult(result);
      setConfirmConvertir(false);
    } catch (err) {
      const msg = (err instanceof Error && err.message) ? err.message : "Erreur lors de la conversion — réessayez.";
      // The backend (FOR UPDATE + livraisonId check) throws this when a concurrent
      // request already created the livraison. Instead of showing a confusing error,
      // reload the session so the UI transitions to the receipt screen.
      if (msg.includes("Une livraison a déjà été créée")) {
        try {
          const updated = await getSessionDetail(sessionTerminee.id);
          setSessionTerminee(updated);
        } catch {
          // silencieux — la session restera telle quelle
        }
        setConfirmConvertir(false);
      } else {
        // Afficher l'erreur DANS la modale (ne pas fermer) pour que l'utilisateur la voit
        setErreur(msg);
        // La modale reste ouverte — l'utilisateur voit l'erreur et peut réessayer
      }
    } finally {
      setConvertirLoading(false);
      convertirInProgressRef.current = false;
    }
  }

  // ── Charger les avances du délégué dès la clôture d'une session membre ───────
  useEffect(() => {
    if (step !== "succes" || !sessionTerminee || sessionTerminee.operation === "reception_transfert" || !isOnline || brouillon) return;
    setAvancesLoading(true);
    // Passer membreId pour les peseurs base centrale (non rattachés à un délégué)
    getAvancesDeleguesTerrain(sessionTerminee.membreId)
      .then((avances) => {
        setAvancesDelegue(avances);
        const edits: Record<number, { planType: string; montantPartiel: string; reportDate: string }> = {};
        for (const a of avances) {
          edits[a.id] = {
            planType: a.planType,
            montantPartiel: a.montantPartielFcfa ? String(a.montantPartielFcfa) : "",
            reportDate: a.reportDate ?? "",
          };
        }
        setAvancePlanEdits(edits);
      })
      .catch(() => { /* peseur sans délégué rattaché ou pas de connexion — silencieux */ })
      .finally(() => setAvancesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sessionTerminee?.id]);

  // ── Enregistrer les décisions de plan sur toutes les avances modifiées ───────
  async function handleSavePlans() {
    setPlansSaving(true);
    setErreur("");
    try {
      for (const [avanceIdStr, edit] of Object.entries(avancePlanEdits)) {
        const avanceId = Number(avanceIdStr);
        const original = avancesDelegue.find((a) => a.id === avanceId);
        if (!original) continue;
        // Ne patcher que si le plan a changé
        const unchanged =
          edit.planType === original.planType &&
          edit.montantPartiel === (original.montantPartielFcfa ? String(original.montantPartielFcfa) : "") &&
          edit.reportDate === (original.reportDate ?? "");
        if (unchanged) continue;
        const patchFn = original.isMembreAvance ? patchPlanAvanceMembre : patchPlanAvanceDeleague;
        await patchFn(avanceId, {
          plan_type: edit.planType,
          montant_partiel_fcfa: edit.planType === "partiel" && edit.montantPartiel ? Number(edit.montantPartiel) : null,
          report_date: edit.planType === "reporte" && edit.reportDate ? edit.reportDate : null,
        });
      }
      setPlansSaved(true);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setPlansSaving(false);
    }
  }

  function reset() {
    setStep("membre");
    setFournisseur(null);
    setSession(null);
    setSessionTerminee(null);
    setBrouillon(null);
    setLivraisonResult(null);
    setErreur("");
    setNbSacs("");
    setPoidsBrut("");
    setTare("0");
    setNotesLigne("");
    setAvancesDelegue([]);
    setAvancePlanEdits({});
    setPlansSaved(false);
    setPlansSaving(false);
  }

  /**
   * Retire immédiatement le formulaire d'une session qui n'est plus exploitable,
   * même si une réponse API arrive après que son statut a déjà changé.
   */
  function quitterSessionAnnulee(sessionAnnulee?: SessionDetail | null) {
    const retourReceptions =
      sessionAnnulee?.operation === "reception_membre_delegue"
      || sessionAnnulee?.operation === "reception_transfert";

    setConfirmAnnuler(false);
    setAnnulerLoading(false);
    setSession(null);
    setSessionTerminee(null);
    setBrouillon(null);
    setFournisseur(null);
    setErreur("");
    setStep("membre");
    setLocation(retourReceptions ? "/receptions" : "/");
  }

  /**
   * Même nettoyage qu'une session inactive, mais sans navigation automatique.
   * Utilisé après un échec d'enregistrement afin de conserver le message
   * d'erreur visible dans le parcours de pesée groupée.
   */
  function quitterSessionSansNavigation(message: string) {
    setConfirmAnnuler(false);
    setAnnulerLoading(false);
    setSession(null);
    setSessionTerminee(null);
    setBrouillon(null);
    setFournisseur(null);
    setErreur(message);
    setStep("membre");
  }

  const poidsNet = (parseFloat(poidsBrut) || 0) - (parseFloat(tare) || 0);
  const poidsTotalNum = parseFloat(String(session?.poidsTotalKg ?? 0));

  if (resumeLoading) {
    return (
      <div className="t-app">
        <header className="t-header t-header--peseur">
          <button
            className="t-header__back"
            onClick={() => setLocation("/")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={22} />
          </button>
          <div><div className="t-header__title">Pesée groupée</div></div>
        </header>
        <main className="t-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <div style={{ textAlign: "center", color: "var(--t-muted)" }}>
            <Loader2 size={36} style={{ margin: "0 auto 12px", animation: "t-spin .8s linear infinite" }} color="var(--t-peseur)" />
            <div style={{ fontSize: ".9rem" }}>Chargement de la session…</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="t-app">
      <header className="t-header t-header--peseur">
        {step !== "succes" ? (
          <button
            className="t-header__back"
            onClick={() => setLocation("/")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <ChevronLeft size={22} />
          </button>
        ) : null}
        <div>
          <div className="t-header__title">Pesée groupée</div>
          {step === "session" && session && (
            <div className="t-header__sub" style={{ fontFamily: "monospace", fontSize: ".75rem" }}>
              {session.numeroSession}
            </div>
          )}
        </div>
      </header>

      <OfflineBanner />

      <main className="t-main t-main--no-nav" style={{ paddingBottom: 90 }}>

        {/* ─── STEP : Choisir membre ─────────────────────────────────────── */}
        {step === "membre" && (
          <>
            {!isOnline && (
              <div style={{
                margin: "16px 16px 0", padding: "12px 14px", borderRadius: 12,
                borderLeft: "4px solid var(--t-peseur)", background: "var(--t-peseur-bg)",
                display: "flex", gap: 10, alignItems: "flex-start",
              }}>
                <WifiOff size={18} color="var(--t-peseur)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ color: "var(--t-peseur-dark)", fontWeight: 700, fontSize: ".88rem" }}>
                    Mode hors ligne
                  </div>
                  <div style={{ color: "var(--t-muted)", fontSize: ".78rem", marginTop: 2 }}>
                    Sélectionnez un planteur pour démarrer une pesée. Elle sera synchronisée à la reconnexion.
                  </div>
                </div>
              </div>
            )}
            {erreur && (
              <div style={{
                margin: "12px 16px 0", padding: "10px 14px", borderRadius: 10,
                borderLeft: "4px solid var(--t-danger)", background: "var(--t-danger-bg)",
                display: "flex", gap: 8, alignItems: "center",
              }}>
                <AlertTriangle size={15} color="var(--t-danger)" style={{ flexShrink: 0 }} />
                <span style={{ color: "var(--t-danger)", fontSize: ".85rem" }}>{erreur}</span>
              </div>
            )}
            <FournisseurSearch
              title="Choisir le planteur"
              onSelect={handleSelectMembre}
              activeSessions={activeSessions}
              onSelectActiveSession={handleSelectActiveSession}
            />
          </>
        )}

        {/* ─── STEP : Certification cacao ──────────────────────────────── */}
        {step === "certif" && fournisseur && (
          <div style={{ padding: "16px" }}>
            {/* Membre sélectionné */}
            <div style={{
              background: "var(--t-peseur-bg)", border: "1.5px solid var(--t-peseur)",
              borderRadius: 12, padding: "12px 14px", marginBottom: 20,
            }}>
              <div style={{ fontSize: ".7rem", color: "var(--t-peseur)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>Producteur</div>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--t-text)" }}>{fournisseur.prenoms} {fournisseur.nom}</div>
              {fournisseur.code && <div style={{ fontSize: ".78rem", color: "var(--t-muted)", marginTop: 2 }}>Code : {fournisseur.code}</div>}
            </div>

            {/* Sélection du type de cacao */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: ".72rem", color: "var(--t-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
                Type de cacao
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {(["RA", "FAIRTRADE", "ASR_1000", "ORDINAIRE"] as const).map(cert => (
                  <button
                    key={cert}
                    onClick={() => setCertificationCacao(certificationCacao === cert ? "" : cert)}
                    style={{
                      padding: "16px 8px",
                      borderRadius: 12,
                      border: `2px solid ${certificationCacao === cert ? "var(--t-peseur)" : "var(--t-border)"}`,
                      background: certificationCacao === cert ? "var(--t-peseur-bg)" : "var(--t-card)",
                      color: certificationCacao === cert ? "var(--t-peseur-dark)" : "var(--t-text)",
                      fontWeight: 700, fontSize: ".95rem",
                      cursor: "pointer", transition: "all .15s",
                    }}
                  >
                    {cert}
                  </button>
                ))}
              </div>
            </div>

            {erreur && (
              <div style={{
                marginBottom: 12, padding: "10px 14px", borderRadius: 10,
                borderLeft: "4px solid var(--t-danger)", background: "var(--t-danger-bg)",
                display: "flex", gap: 8, alignItems: "center",
              }}>
                <AlertTriangle size={15} color="var(--t-danger)" style={{ flexShrink: 0 }} />
                <span style={{ color: "var(--t-danger)", fontSize: ".85rem" }}>{erreur}</span>
              </div>
            )}

            <button
              onClick={handleConfirmerCertif}
              className="t-btn t-btn--primary"
              disabled={!certificationCacao}
              style={{
                width: "100%", marginBottom: 10,
                opacity: certificationCacao ? 1 : .5,
                cursor: certificationCacao ? "pointer" : "not-allowed",
              }}
            >
              {certificationCacao ? `Commencer — ${certificationCacao}` : "Commencer la pesée"}
            </button>
            <button
              onClick={() => { setStep("membre"); setFournisseur(null); setErreur(""); }}
              className="t-btn t-btn--ghost"
              style={{ width: "100%" }}
            >
              ← Retour
            </button>
          </div>
        )}

        {/* ─── STEP : Session active ────────────────────────────────────── */}
        {step === "session" && session && (
          fournisseur != null
          || session.operation === "reception_transfert"
          || session.operation === "reception_membre_delegue"
        ) && (
          <>
            {/* Info membre OU info transfert */}
            {session.operation === "reception_transfert" ? (
              <div className="t-card" style={{ margin: "16px 16px 8px", borderLeft: "4px solid var(--t-info)", background: "var(--t-card)", padding: 0, overflow: "hidden" }}>
                {/* Titre */}
                <div style={{ background: "var(--t-info-bg)", padding: "10px 14px", borderBottom: "1px solid var(--t-border)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "1.2rem" }}>🚛</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: ".68rem", color: "var(--t-info)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>Réception de transfert</div>
                    <div style={{ fontWeight: 800, fontSize: ".92rem", color: "var(--t-text)" }}>
                      {session.transfertNumero ?? `Session ${session.numeroSession}`}
                    </div>
                  </div>
                </div>
                {/* Métriques */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: "1px solid var(--t-border)" }}>
                  <div style={{ padding: "10px 14px", borderRight: "1px solid var(--t-border)" }}>
                    <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginBottom: 2 }}>Poids déclaré</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--t-success)" }}>
                      {session.transfertPoidsDeclaréKg
                        ? (parseFloat(session.transfertPoidsDeclaréKg) >= 1000
                            ? (parseFloat(session.transfertPoidsDeclaréKg) / 1000).toFixed(2) + " T"
                            : parseFloat(session.transfertPoidsDeclaréKg).toLocaleString("fr-FR") + " kg")
                        : "—"}
                    </div>
                  </div>
                  <div style={{ padding: "10px 14px" }}>
                    <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginBottom: 2 }}>Sacs déclarés</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--t-warning)" }}>
                      {session.transfertNombreSacs ?? "—"}
                    </div>
                  </div>
                </div>
                {/* Source */}
                <div style={{ padding: "8px 14px" }}>
                  <div style={{ fontSize: ".7rem", color: "var(--t-muted)" }}>
                    <span>Source : </span>
                    <span style={{ color: "var(--t-info)", fontWeight: 600 }}>
                      {session.transfertEntrepotNom ?? "Entrepôt délégué"}
                      {session.transfertZoneNom ? ` · ${session.transfertZoneNom}` : ""}
                    </span>
                  </div>
                  {(session.transfertDelegueNom ?? session.transfertDeleguePrenoms) && (
                    <div style={{ fontSize: ".7rem", color: "var(--t-muted)", marginTop: 2 }}>
                      <span>Délégué : </span>
                      <span style={{ color: "var(--t-text)", fontWeight: 600 }}>
                        {session.transfertDelegueNom ?? ""} {session.transfertDeleguePrenoms ?? ""}
                      </span>
                    </div>
                  )}
                  <div style={{ fontSize: ".65rem", color: "var(--t-muted)", marginTop: 4 }}>Session · {session.numeroSession}</div>
                </div>
              </div>
            ) : fournisseur && (
              <div className="t-card" style={{ margin: "16px 16px 8px", borderLeft: "4px solid var(--t-primary)" }}>
                <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                  {fournisseur.nom} {fournisseur.prenoms}
                </div>
                <div className="t-text-muted">{fournisseur.code}</div>
              </div>
            )}

            {sessionMembreDelegueIncomplete && (
              <div style={{
                margin: "16px 16px 8px", padding: "12px 14px", borderRadius: 12,
                borderLeft: "4px solid var(--t-warning)", background: "var(--t-warning-bg)",
                color: "var(--t-text)", fontSize: ".84rem", lineHeight: 1.45,
              }}>
                <strong>Session incomplète</strong>
                <div style={{ marginTop: 4 }}>
                  Cette session n&apos;est associée à aucun membre délégué. Annulez-la, puis démarrez à nouveau la pesée depuis le bon de réception.
                </div>
              </div>
            )}

            {/* Bannière hors ligne */}
            {brouillon && (
              <div style={{
                margin: "0 16px 8px", padding: "8px 12px", borderRadius: 10,
                background: "var(--t-warning-bg)", borderLeft: "3px solid var(--t-warning)",
                display: "flex", gap: 8, alignItems: "center",
              }}>
                <WifiOff size={14} color="var(--t-warning)" style={{ flexShrink: 0 }} />
                <span style={{ color: "var(--t-warning)", fontSize: ".8rem", fontWeight: 600 }}>
                  Pesée hors ligne — sera synchronisée à la reconnexion
                </span>
              </div>
            )}

            {/* Cumul session */}
            <div style={{
              margin: "0 16px 10px", background: "var(--t-card)", borderRadius: 14,
              border: "1px solid rgba(26,71,49,.12)",
              boxShadow: "0 2px 8px rgba(0,0,0,.06)",
              overflow: "hidden",
            }}>
              <div style={{
                background: "linear-gradient(135deg, var(--t-primary) 0%, var(--t-peseur-dark) 100%)",
                padding: "8px 14px",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <span style={{ fontSize: ".68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "rgba(255,255,255,.8)" }}>
                  Cumul session
                </span>
                <span style={{ fontSize: ".68rem", color: "rgba(255,255,255,.6)", fontFamily: "monospace" }}>
                  {session.numeroSession}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                {[
                  { label: "Passages", value: session.lignes.length, color: "var(--t-primary)" },
                  { label: "Sacs", value: session.nbSacsTotal, color: "var(--t-peseur)" },
                  { label: fmtPoids(poidsTotalNum), value: null, color: "var(--t-success)", big: true },
                ].map((stat, i) => (
                  <div key={i} style={{
                    padding: "12px 8px", textAlign: "center",
                    borderRight: i < 2 ? "1px solid var(--t-border)" : undefined,
                  }}>
                    {stat.big ? (
                      <>
                        <div style={{ fontSize: "1.2rem", fontWeight: 800, color: stat.color, lineHeight: 1.1 }}>
                          {stat.label}
                        </div>
                        <div style={{ fontSize: ".62rem", color: "var(--t-muted)", marginTop: 3 }}>Total net</div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: "1.5rem", fontWeight: 800, color: stat.color }}>
                          {stat.value}
                        </div>
                        <div style={{ fontSize: ".62rem", color: "var(--t-muted)", marginTop: 1 }}>{stat.label}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Lignes existantes */}
            {session.lignes.length > 0 && (
              <div style={{ margin: "0 16px 10px" }}>
                <div style={{
                  fontSize: ".68rem", color: "var(--t-muted)", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 6,
                }}>
                  Pesées enregistrées
                </div>
                {session.lignes.map((l) => {
                  const net = parseFloat(l.poidsBrutKg) - parseFloat(l.tareKg ?? "0");
                  return (
                    <div key={l.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "var(--t-card)", border: "1px solid var(--t-border)",
                      borderRadius: 10, padding: "10px 12px", marginBottom: 6,
                      boxShadow: "0 1px 3px rgba(0,0,0,.05)",
                    }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 8, background: "var(--t-peseur-bg)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: ".75rem", fontWeight: 800, color: "var(--t-peseur)", flexShrink: 0,
                      }}>
                        {l.numeroPassage}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: ".9rem", fontWeight: 700, color: "var(--t-text)" }}>
                          {fmtPoids(net)}
                          {l.nbSacs > 0 && (
                            <span style={{ color: "var(--t-muted)", fontWeight: 400, fontSize: ".8rem", marginLeft: 6 }}>
                              · {l.nbSacs} sac{l.nbSacs > 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        {parseFloat(l.tareKg ?? "0") > 0 && (
                          <div style={{ fontSize: ".7rem", color: "var(--t-muted)", marginTop: 1 }}>
                            Brut {parseFloat(l.poidsBrutKg).toFixed(3)} kg − tare {parseFloat(l.tareKg ?? "0").toFixed(3)} kg
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleSupprimerLigne(l.id)}
                        style={{
                          background: "rgba(220,38,38,.08)", border: "none", borderRadius: 8,
                          color: "var(--t-danger)", cursor: "pointer", padding: "6px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        title="Supprimer cette pesée"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Formulaire nouvelle pesée */}
            <div className="t-form" style={{ margin: "0 16px" }}>
              <div style={{
                fontSize: ".68rem", color: "var(--t-peseur-dark)", fontWeight: 700,
                textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <Plus size={13} />
                Nouveau passage
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div className="t-field">
                   <label className="t-label">Nb de sacs *</label>
                  <NumericInput
                    decimal={false}
                    className="t-input t-input--lg"
                    value={nbSacs}
                    onChange={(value) => {
                      setNbSacs(value);
                      setTare(tareFromNombreSacs(value));
                    }}
                     min="1"
                     placeholder="Ex : 5"
                     aria-required="true"
                  />
                   {nbSacsInvalide && (
                     <div style={{ color: "var(--t-danger)", fontSize: ".75rem", marginTop: 4 }}>
                       Indiquez le nombre de sacs (au moins 1).
                     </div>
                   )}
                </div>
                <div className="t-field">
                  <label className="t-label">Tare (kg) · 1 kg par sac</label>
                  <NumericInput
                    decimal
                    className="t-input"
                    value={tare}
                    onChange={() => {}}
                    step="0.1"
                    min="0"
                    readOnly
                    aria-label="Tare calculée automatiquement"
                    title="La tare est calculée automatiquement : 1 kg par sac"
                  />
                </div>
              </div>

              {/* Lecture automatique depuis la balance RS232 (service local) */}
              <ScaleWeightDisplay
                onUse={(kg) => setPoidsBrut(kg.toFixed(3))}
                onConnectionChange={setScaleConnected}
              />

              <div className="t-field" style={{ marginBottom: 8 }}>
                <label className="t-label">Poids brut (kg) *</label>
                {poidsSaisieVerrouillee && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".75rem", color: "#64748b", marginBottom: 4 }}>
                    <span>🔒</span>
                    <span>Saisie manuelle désactivée — utilisez la balance</span>
                  </div>
                )}
                <NumericInput
                  decimal
                  className="t-input t-input--lg"
                  value={poidsBrut}
                  onChange={(value) => { if (!poidsSaisieVerrouillee) setPoidsBrut(value); }}
                  step="0.001"
                  min="0"
                  placeholder={poidsSaisieVerrouillee ? "Poids depuis la balance" : "Ex : 247.500"}
                  disabled={poidsSaisieVerrouillee}
                  style={poidsSaisieVerrouillee ? { background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed", opacity: 0.85 } : undefined}
                />
              </div>

              {poidsBrut && parseFloat(poidsBrut) > 0 && (
                <div className="t-recap" style={{ marginBottom: 10 }}>
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Poids net ce passage</span>
                    <span className="t-recap-row__value">{Math.max(0, poidsNet).toFixed(3)} kg</span>
                  </div>
                  {session.lignes.length > 0 && (
                    <div className="t-recap-row t-recap-row--total">
                      <span className="t-recap-row__label" style={{ fontWeight: 700 }}>Total après ce passage</span>
                      <span className="t-recap-row__value">{fmtPoids(poidsTotalNum + Math.max(0, poidsNet))}</span>
                    </div>
                  )}
                </div>
              )}

              {erreur && (
                <div style={{
                  display: "flex", gap: 6, alignItems: "center",
                  color: "var(--t-danger)", fontSize: ".82rem", marginBottom: 8,
                }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                  {erreur}
                </div>
              )}

              <button
                className="t-btn t-btn--primary"
                style={{
                  width: "100%", marginBottom: 10,
                  background: "linear-gradient(135deg, var(--t-peseur-dark) 0%, var(--t-peseur) 100%)",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                 disabled={nbSacsInvalide || !sessionSaisissable || sessionMembreDelegueIncomplete || !poidsBrut || parseFloat(poidsBrut) <= 0 || ajoutLoading}
                onClick={handleAjouterLigne}
              >
                {ajoutLoading
                  ? <Loader2 size={16} style={{ animation: "t-spin .8s linear infinite" }} />
                  : <Plus size={16} />}
                {ajoutLoading ? "Enregistrement…" : "Enregistrer ce passage"}
              </button>

              {/* Actions session */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="t-btn t-btn--ghost"
                  style={{ flex: 1, color: "var(--t-danger)", borderColor: "var(--t-danger)", height: 52, fontSize: ".85rem" }}
                  onClick={() => setConfirmAnnuler(true)}
                >
                  <X size={15} style={{ marginRight: 4 }} />
                  Annuler
                </button>
                <button
                  className="t-btn t-btn--primary"
                  style={{
                    flex: 2, height: 52,
                    background: session.lignes.length === 0
                      ? "#334155"
                      : "linear-gradient(135deg, var(--t-primary) 0%, var(--t-success) 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                  disabled={!sessionSaisissable || sessionMembreDelegueIncomplete || session.lignes.length === 0 || terminerLoading}
                  onClick={() => setConfirmTerminer(true)}
                >
                  <CheckCheck size={16} />
                  Terminer la pesée
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── STEP : Succès ────────────────────────────────────────────── */}
        {step === "succes" && sessionTerminee && (() => {
          const isTransfertReception = sessionTerminee.operation === "reception_transfert";
          return (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            {/* Icon success */}
            <div style={{
              width: 72, height: 72, borderRadius: 20, margin: "0 auto 16px",
              background: livraisonResult
                ? "linear-gradient(135deg, var(--t-success) 0%, #4ade80 100%)"
                : isTransfertReception
                  ? "linear-gradient(135deg, var(--t-peseur-dark) 0%, var(--t-peseur) 100%)"
                  : "linear-gradient(135deg, var(--t-primary) 0%, var(--t-success) 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 6px 20px rgba(22,163,74,.3)",
            }}>
              {isTransfertReception
                ? <Scale size={32} color="#fff" strokeWidth={1.8} />
                : livraisonResult
                  ? <CheckCircle2 size={32} color="#fff" strokeWidth={2} />
                  : <CheckCheck size={32} color="#fff" strokeWidth={2} />}
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--t-primary)", marginBottom: 4 }}>
              {isTransfertReception ? "Pesée de réception clôturée" : livraisonResult ? "Livraison créée !" : "Pesée terminée"}
            </div>
            <div style={{
              display: "inline-block", fontSize: ".75rem", color: "var(--t-peseur)", fontFamily: "monospace",
              background: "var(--t-peseur-bg)", padding: "3px 10px", borderRadius: 8, marginBottom: 20,
            }}>
              {sessionTerminee.numeroSession}
            </div>

            {/* Message spécifique réception de transfert */}
            {isTransfertReception && (
              <div style={{
                background: "var(--t-success-bg)", border: "1px solid var(--t-success)",
                borderRadius: 10, padding: 14, marginBottom: 20, fontSize: ".85rem", color: "var(--t-success)", textAlign: "left",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  ✅ Poids officiel enregistré : {fmtPoids(parseFloat(String(sessionTerminee.poidsTotalKg)))}
                </div>
                <div style={{ fontSize: ".78rem", color: "var(--t-muted)" }}>
                  Le transfert a été mis à jour avec le poids pesé. Le stock central a été crédité automatiquement (ou un litige a été ouvert si l'écart dépasse 0,5 %).
                </div>
              </div>
            )}

            {/* Récap session — pour sessions membres uniquement */}
            {!isTransfertReception && (
            <div className="t-recap" style={{ textAlign: "left", marginBottom: 20 }}>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Producteur</span>
                <span className="t-recap-row__value">{sessionTerminee.membreNom} {sessionTerminee.membrePrenoms}</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Produit</span>
                <span className="t-recap-row__value">{sessionTerminee.produit}</span>
              </div>
              {sessionTerminee.certificationCacao && (
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Certification</span>
                  <span className="t-recap-row__value" style={{ fontWeight: 700, color: "var(--t-peseur-dark)" }}>
                    {sessionTerminee.certificationCacao}
                  </span>
                </div>
              )}
              <div className="t-recap-row">
                <span className="t-recap-row__label">Nombre de pesées</span>
                <span className="t-recap-row__value">{sessionTerminee.lignes?.length ?? 0} passages</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Total sacs</span>
                <span className="t-recap-row__value">{sessionTerminee.nbSacsTotal} sacs</span>
              </div>
              <div className="t-divider" />
              <div className="t-recap-row t-recap-row--total">
                <span className="t-recap-row__label" style={{ fontWeight: 700 }}>Poids total net</span>
                <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.1rem" }}>
                  {fmtPoids(parseFloat(String(sessionTerminee.poidsTotalKg)))}
                </span>
              </div>
            </div>
            )}

            {/* Récap pesées pour sessions transfert (simplifié) */}
            {isTransfertReception && (
              <div className="t-recap" style={{ textAlign: "left", marginBottom: 20 }}>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Nombre de passages</span>
                  <span className="t-recap-row__value">{sessionTerminee.lignes?.length ?? 0}</span>
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Total sacs</span>
                  <span className="t-recap-row__value">{sessionTerminee.nbSacsTotal} sacs</span>
                </div>
                <div className="t-divider" />
                <div className="t-recap-row t-recap-row--total">
                  <span className="t-recap-row__label" style={{ fontWeight: 700 }}>Poids pesé (officiel)</span>
                  <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.1rem" }}>
                    {fmtPoids(parseFloat(String(sessionTerminee.poidsTotalKg)))}
                  </span>
                </div>
              </div>
            )}

            {/* ── Détail de la livraison (après conversion) ─────────────── */}
            {livraisonResult && (
              <div className="t-recap" style={{ textAlign: "left", marginBottom: 20, borderLeft: "4px solid #22c55e" }}>
                <div style={{ fontSize: ".7rem", color: "var(--t-success)", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                  Décompte livraison
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">
                    Prix ({livraisonResult.prixUnitaireFcfa.toLocaleString("fr-FR")} FCFA/kg)
                  </span>
                  <span className="t-recap-row__value">{livraisonResult.montantBrutFcfa.toLocaleString("fr-FR")} FCFA</span>
                </div>
                {livraisonResult.avanceDeduiteFcfa > 0 && (
                  <div className="t-recap-row t-recap-row--deduction">
                    <span className="t-recap-row__label">Avance déduite</span>
                    <span className="t-recap-row__value" style={{ color: "#f87171" }}>
                      −{livraisonResult.avanceDeduiteFcfa.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                )}
                {livraisonResult.intrantsDeduitsFcfa > 0 && (
                  <div className="t-recap-row t-recap-row--deduction">
                    <span className="t-recap-row__label">Intrants déduits</span>
                    <span className="t-recap-row__value" style={{ color: "#f87171" }}>
                      −{livraisonResult.intrantsDeduitsFcfa.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                )}
                <div className="t-divider" />
                <div className="t-recap-row t-recap-row--total">
                  <span className="t-recap-row__label" style={{ fontWeight: 800 }}>Montant net</span>
                  <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.15rem" }}>
                    {livraisonResult.montantNetFcfa.toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              </div>
            )}

            {/* Pesée enregistrée hors ligne — en attente de sync */}
            {brouillon && (
              <div style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: ".88rem", color: "#f59e0b", marginBottom: 4 }}>
                  📴 Pesée enregistrée hors ligne
                </div>
                <div style={{ fontSize: ".78rem", color: "#64748b", marginBottom: brouillon.syncStatus === "error" ? 8 : 0 }}>
                  La pesée sera envoyée au serveur dès le retour du réseau. La conversion en livraison sera possible une fois synchronisée.
                </div>
                {brouillon.syncStatus === "error" && brouillon.errorMsg && (
                  <div style={{ fontSize: ".76rem", color: "var(--t-danger)", background: "var(--t-danger-bg)", borderRadius: 6, padding: "6px 10px" }}>
                    ⚠️ Erreur lors de la synchronisation : {brouillon.errorMsg}
                  </div>
                )}
              </div>
            )}

            {/* Erreur conversion */}
            {erreur && !livraisonResult && (
              <div style={{ color: "#ef4444", fontSize: ".82rem", marginBottom: 12, textAlign: "left" }}>⚠️ {erreur}</div>
            )}

            {/* Détail lignes */}
            {!livraisonResult && (sessionTerminee.lignes?.length ?? 0) > 0 && (
              <div style={{ textAlign: "left", marginBottom: 20 }}>
                <div style={{ fontSize: ".7rem", color: "var(--t-muted)", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                  Détail des passages
                </div>
                {sessionTerminee.lignes.map((l) => {
                  const net = parseFloat(l.poidsBrutKg) - parseFloat(l.tareKg ?? "0");
                  return (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--t-border)", fontSize: ".85rem" }}>
                      <span style={{ color: "var(--t-muted)" }}>Passage {l.numeroPassage} · {l.nbSacs} sac{l.nbSacs !== 1 ? "s" : ""}</span>
                      <span style={{ color: "var(--t-text)", fontWeight: 600 }}>{net.toFixed(3)} kg</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bouton reçu PDF (après conversion dans cette session) */}
            {livraisonResult && isOnline && (
              <RecuButton livraisonId={livraisonResult.livraisonId} />
            )}

            {/* Bouton reçu PDF (session déjà convertie lors d'une visite précédente) */}
            {!livraisonResult && sessionTerminee?.livraisonId && isOnline && (
              <RecuButton livraisonId={sessionTerminee.livraisonId} />
            )}

            {/* ── Avances du délégué — notification avant génération du reçu ── */}
            {!brouillon && !isTransfertReception && !livraisonResult && !sessionTerminee?.livraisonId && (avancesLoading || avancesDelegue.length > 0) && (
              <div style={{ marginBottom: 16, border: "2px solid #f59e0b", borderRadius: 12, overflow: "hidden" }}>
                {/* En-tête alerte */}
                <div style={{ background: "#f59e0b", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: "1.2rem" }}>⚠️</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: ".9rem", color: "#1c1917" }}>Avances en cours sur ce délégué</div>
                    <div style={{ fontSize: ".73rem", color: "#44403c" }}>Choisissez le plan de remboursement avant de générer le reçu</div>
                  </div>
                </div>
                <div style={{ background: "#fefce8", padding: "12px 14px" }}>
                  {avancesLoading ? (
                    <div style={{ color: "#92400e", fontSize: ".82rem", textAlign: "center", padding: "8px 0" }}>Chargement…</div>
                  ) : avancesDelegue.map((avance) => {
                    const edit = avancePlanEdits[avance.id] ?? { planType: avance.planType, montantPartiel: "", reportDate: "" };
                    return (
                      <div key={avance.id} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #fde68a" }}>
                        <div style={{ fontSize: ".82rem", color: "#78350f", fontWeight: 700, marginBottom: 6 }}>
                          {avance.motif || "Avance"} — Solde restant : {avance.soldeRestantFcfa.toLocaleString("fr-FR")} FCFA
                        </div>
                        <select
                          value={edit.planType}
                          onChange={(e) =>
                            setAvancePlanEdits((prev) => ({
                              ...prev,
                              [avance.id]: { planType: e.target.value, montantPartiel: "", reportDate: "" },
                            }))
                          }
                          style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #d97706", background: "#fff", fontSize: ".85rem", marginBottom: 6 }}
                        >
                          <option value="integral">Déduire intégralement — {avance.soldeRestantFcfa.toLocaleString("fr-FR")} FCFA sur prochaine commission</option>
                          <option value="partiel">Déduction partielle — montant fixe par commission</option>
                          <option value="reporte">Reporter sur la prochaine pesée</option>
                        </select>
                        {edit.planType === "partiel" && (
                          <NumericInput
                            decimal={false}
                            placeholder={`Montant par retenue (max ${avance.soldeRestantFcfa.toLocaleString("fr-FR")} FCFA)`}
                            value={edit.montantPartiel}
                            min={1}
                            max={avance.soldeRestantFcfa}
                            onChange={(value) =>
                              setAvancePlanEdits((prev) => ({
                                ...prev,
                                [avance.id]: { ...edit, montantPartiel: value },
                              }))
                            }
                            style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #d97706", fontSize: ".85rem" }}
                          />
                        )}
                        {edit.planType === "reporte" && (
                          <div>
                            <div style={{ fontSize: ".73rem", color: "#92400e", marginBottom: 4 }}>Date de reprise de la retenue (optionnel)</div>
                            <input
                              type="date"
                              value={edit.reportDate}
                              onChange={(e) =>
                                setAvancePlanEdits((prev) => ({
                                  ...prev,
                                  [avance.id]: { ...edit, reportDate: e.target.value },
                                }))
                              }
                              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #d97706", fontSize: ".85rem" }}
                            />
                            <div style={{ fontSize: ".7rem", color: "#92400e", marginTop: 4 }}>
                              Sans date : aucune retenue jusqu'à décision manuelle
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!avancesLoading && avancesDelegue.length > 0 && (
                    <button
                      disabled={plansSaving || plansSaved}
                      onClick={handleSavePlans}
                      style={{
                        width: "100%", padding: "10px", borderRadius: 8, border: "none",
                        background: plansSaved ? "#16a34a" : "#d97706",
                        color: "#fff", fontWeight: 700, fontSize: ".88rem", cursor: "pointer",
                        opacity: plansSaving ? .7 : 1,
                      }}
                    >
                      {plansSaving ? "Enregistrement…" : plansSaved ? "✔ Décisions enregistrées" : "Enregistrer les décisions"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bouton conversion (si pas encore convertie, sessions membres uniquement, et session en ligne) */}
            {!brouillon && !isTransfertReception && !livraisonResult && !sessionTerminee?.livraisonId && isOnline && !sessionConvertible && (
              <div
                role="alert"
                style={{
                  background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10,
                  color: "#b91c1c", fontSize: ".84rem", lineHeight: 1.45,
                  padding: "12px 14px", marginBottom: 10, textAlign: "left",
                }}
              >
                <strong>Livraison impossible pour cette session.</strong>
                <br />
                Ajoutez au moins un passage avec un poids net supérieur à 0 kg, puis terminez de nouveau la pesée.
              </div>
            )}
            {!brouillon && !isTransfertReception && !livraisonResult && !sessionTerminee?.livraisonId && isOnline && sessionConvertible && (
              <button
                className="t-btn t-btn--primary"
                style={{ width: "100%", marginBottom: 10 }}
                onClick={ouvrirConvertirModal}
              >
                📦 Convertir en livraison
              </button>
            )}

            {/* Bordereau de réception de transfert */}
            {isTransfertReception && sessionTerminee && isOnline && (
              <BordereauSessionButton sessionId={sessionTerminee.id} />
            )}

            {isTransfertReception ? (
              <button className="t-btn t-btn--ghost" style={{ width: "100%", marginBottom: 10 }} onClick={() => setLocation("/receptions")}>
                ← Retour aux réceptions
              </button>
            ) : (
              <button className="t-btn t-btn--primary" style={{ width: "100%", marginBottom: 10, background: livraisonResult ? undefined : "#334155" }} onClick={reset}>
                ⊕ Nouvelle session
              </button>
            )}
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => setLocation("/")}>
              Retour à l'accueil
            </button>
          </div>
          );
        })()}
      </main>

      <BottomNavPeseur />

      {/* Modal confirmation terminer */}
      {confirmTerminer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--t-card)", width: "100%", borderRadius: "18px 18px 0 0", padding: 24, boxShadow: "0 -4px 20px rgba(0,0,0,.15)" }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--t-text)", marginBottom: 8, textAlign: "center" }}>
              Terminer la pesée ?
            </div>
            <div style={{ fontSize: ".85rem", color: "var(--t-muted)", textAlign: "center", marginBottom: 20 }}>
              {session?.nbSacsTotal} sacs · {fmtPoids(poidsTotalNum)} total net
              <br />Cette action est irréversible.
            </div>
            <button className="t-btn t-btn--primary" style={{ width: "100%", marginBottom: 10 }}
              disabled={terminerLoading} onClick={handleTerminer}>
              {terminerLoading ? "Clôture…" : "✔ Confirmer la clôture"}
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => setConfirmTerminer(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmation convertir en livraison */}
      {confirmConvertir && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--t-card)", width: "100%", borderRadius: "18px 18px 0 0", padding: 24, boxShadow: "0 -4px 20px rgba(0,0,0,.15)" }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--t-success)", marginBottom: 8, textAlign: "center" }}>
              📦 Convertir en livraison
            </div>
            <div style={{ fontSize: ".85rem", color: "var(--t-muted)", textAlign: "center", marginBottom: 16 }}>
              {sessionTerminee?.membreNom} {sessionTerminee?.membrePrenoms}<br />
              {fmtPoids(parseFloat(String(sessionTerminee?.poidsTotalKg ?? 0)))} · {sessionTerminee?.nbSacsTotal} sacs
            </div>

            {/* Estimation financière */}
            {estimeLoading ? (
              <div style={{ textAlign: "center", color: "#64748b", fontSize: ".8rem", marginBottom: 16 }}>
                Calcul de l'estimation…
              </div>
            ) : estimePrixUnitaire !== null ? (() => {
              const poidsKg = parseFloat(String(sessionTerminee?.poidsTotalKg ?? 0));
              const brut = Math.round(poidsKg * estimePrixUnitaire);
              const avance = estimeAvance;
              const intrants = estimeIntrants;
              const net = Math.max(0, brut - avance - intrants);
              return (
                <div className="t-recap" style={{ marginBottom: 16, borderLeft: "4px solid #22c55e" }}>
                  <div style={{ fontSize: ".68rem", color: "var(--t-success)", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                    Estimation (prix actuel : {estimePrixUnitaire.toLocaleString("fr-FR")} FCFA/kg)
                  </div>
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Montant brut</span>
                    <span className="t-recap-row__value">{brut.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  {avance > 0 && (
                    <div className="t-recap-row">
                      <span className="t-recap-row__label">Avance à déduire</span>
                      <span className="t-recap-row__value" style={{ color: "#f87171" }}>−{avance.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                  {intrants > 0 && (
                    <div className="t-recap-row">
                      <span className="t-recap-row__label">Intrants à déduire</span>
                      <span className="t-recap-row__value" style={{ color: "#f87171" }}>−{intrants.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                  <div className="t-divider" />
                  <div className="t-recap-row t-recap-row--total">
                    <span className="t-recap-row__label" style={{ fontWeight: 800 }}>≈ Montant net estimé</span>
                    <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.1rem" }}>
                      {net.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                </div>
              );
            })() : null}

            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".85rem", color: "#78350f" }}>
              ⏳ Le mode de paiement sera choisi lors du règlement.
            </div>
            {erreur && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".85rem", color: "#dc2626" }}>
                ⚠️ {erreur}
              </div>
            )}
            <button className="t-btn t-btn--primary" style={{ width: "100%", marginBottom: 10 }}
              disabled={convertirLoading} onClick={handleConvertir}>
              {convertirLoading ? "Création en cours…" : erreur ? "↩ Réessayer" : "✔ Confirmer la livraison"}
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => { setConfirmConvertir(false); setErreur(""); }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmation annuler */}
      {confirmAnnuler && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--t-card)", width: "100%", borderRadius: "18px 18px 0 0", padding: 24, boxShadow: "0 -4px 20px rgba(0,0,0,.15)" }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--t-danger)", marginBottom: 8, textAlign: "center" }}>
              Annuler la session ?
            </div>
            <div style={{ fontSize: ".85rem", color: "var(--t-muted)", textAlign: "center", marginBottom: 20 }}>
              Toutes les pesées enregistrées seront perdues.
            </div>
            <button className="t-btn t-btn--ghost" style={{ width: "100%", color: "#ef4444", borderColor: "#ef4444", marginBottom: 10 }}
              disabled={annulerLoading} onClick={handleAnnuler}>
              {annulerLoading ? "Annulation…" : "Oui, annuler la session"}
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => setConfirmAnnuler(false)}>
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
