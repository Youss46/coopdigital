import React from "react";

// Illustrative preview data only. These values are not connected to CoopDigital or a receipt API.
const preview = {
  reference: "PES-S-2026-01047",
  name: "David Diabaté",
  phone: "07 07 77 11 53",
  cni: "CI-0248-1990-00841",
  group: "Union des producteurs de Koffikro",
  section: "Koffikro Nord",
  campaign: "2026–2027",
  date: "10 septembre 2026",
  time: "13:22",
  product: "Cacao certifié — Rainforest Alliance",
  bags: "23 sacs",
  grossWeight: "2 300 kg",
  retention: "100 kg",
  netWeight: "2 200 kg",
  unitPrice: "1 100 FCFA / kg",
  grossAmount: "2 420 000 FCFA",
  advance: "100 000 FCFA",
  advanceStatus: "Déduite",
  inputs: "50 000 FCFA",
  netAmount: 2270000,
  paymentStatus: "À payer",
  receiver: "Aïssata Koné",
  producer: "David Diabaté",
};

const frenchUnderThousand = (value: number): string => {
  const small = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
  const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
  if (value < 17) return small[value];
  if (value < 20) return `dix-${small[value - 10]}`;
  if (value < 70) {
    const ten = Math.floor(value / 10);
    const unit = value % 10;
    return unit === 0 ? tens[ten] : unit === 1 ? `${tens[ten]} et un` : `${tens[ten]}-${small[unit]}`;
  }
  if (value < 80) return value === 71 ? "soixante et onze" : `soixante-${frenchUnderThousand(value - 60)}`;
  if (value < 100) return value === 80 ? "quatre-vingts" : `quatre-vingt-${frenchUnderThousand(value - 80)}`;
  const hundreds = Math.floor(value / 100);
  const remainder = value % 100;
  const prefix = hundreds === 1 ? "cent" : `${small[hundreds]} cent`;
  return remainder === 0
    ? (hundreds > 1 ? `${prefix}s` : prefix)
    : `${prefix} ${frenchUnderThousand(remainder)}`;
};

const amountInWords = (amount: number): string => {
  const millions = Math.floor(amount / 1_000_000);
  const thousands = Math.floor((amount % 1_000_000) / 1_000);
  const remainder = amount % 1_000;
  const words = [
    millions ? `${frenchUnderThousand(millions)} million${millions > 1 ? "s" : ""}` : "",
    thousands ? `${thousands === 1 ? "" : `${frenchUnderThousand(thousands)} `}mille` : "",
    remainder ? frenchUnderThousand(remainder) : "",
  ].filter(Boolean);
  return `${words.join(" ")} francs CFA`;
};

const Detail = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mdr-detail"><span>{label}</span><strong>{children}</strong></div>
);

function getPreviewWidth() {
  if (typeof window === "undefined") return 620;
  return Math.min(794, Math.max(320, window.innerWidth - 32));
}

export function MemberDeliveryReceipt() {
  const [previewWidth, setPreviewWidth] = React.useState(getPreviewWidth);

  React.useEffect(() => {
    const resize = () => setPreviewWidth(getPreviewWidth());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <main className="mdr-stage">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');
        .mdr-stage,.mdr-stage *{box-sizing:border-box}
        .mdr-stage{--ink:#19334a;--navy:#173b5b;--green:#176345;--leaf:#43845d;--muted:#657982;--rule:#d9e3df;--paper:#fffefa;min-height:100dvh;background:#e8eeea;display:flex;justify-content:center;align-items:flex-start;padding:20px 12px;color:var(--ink);font-family:'DM Sans',sans-serif}
        .mdr-preview{width:min(100%,794px);aspect-ratio:210/297;position:relative;flex:none}
        .mdr-paper{position:absolute;top:0;left:50%;width:794px;height:1123px;transform-origin:top center;overflow:hidden;background:var(--paper);padding:35px 42px 30px;box-shadow:0 14px 45px rgba(27,59,69,.15);display:flex;flex-direction:column}
        .mdr-paper:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 92% 30%,rgba(194,218,193,.22),transparent 24%),radial-gradient(ellipse at 4% 87%,rgba(228,210,164,.14),transparent 26%);pointer-events:none}
        .mdr-paper>*{position:relative;flex-shrink:0}
        .mdr-topline{position:absolute!important;left:0;right:0;top:0;height:8px;background:linear-gradient(90deg,#397b58 0 27%,#d1a44e 27% 31%,#173b5b 31%)}
        .mdr-head{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:4px 0 13px;border-bottom:1px solid var(--rule)}
        .mdr-brand{display:flex;align-items:center;gap:14px}
        .mdr-mark{width:54px;height:54px;border-radius:18px 18px 18px 5px;background:var(--green);color:#f7f3e9;display:grid;place-items:center;font:800 29px Georgia,serif;transform:rotate(-3deg);box-shadow:inset 0 0 0 4px rgba(255,255,255,.18)}
        .mdr-brandname{font:800 26px/1 Manrope,sans-serif;letter-spacing:-1.1px;color:var(--navy)}
        .mdr-brandname em{font-style:normal;color:var(--leaf)}
        .mdr-tagline{font-size:10px;color:var(--muted);margin-top:6px;letter-spacing:.02em}
        .mdr-title{text-align:right;border-left:1px solid var(--rule);padding-left:20px}
        .mdr-kicker{font-size:9px;color:var(--green);font-weight:700;letter-spacing:.17em;text-transform:uppercase}
        .mdr-title h1{font:800 20px/1.2 Manrope,sans-serif;color:var(--navy);margin:5px 0 8px;letter-spacing:.015em}
        .mdr-ref{background:var(--navy);color:#fff;border-radius:3px;padding:6px 10px;font:700 12px 'DM Sans',sans-serif;letter-spacing:.06em;display:inline-block}
        .mdr-refnote{font-size:8px;color:var(--muted);margin-top:5px}
        .mdr-welcome{margin:11px 0 10px;padding:11px 16px;background:#f0f4ef;border-left:4px solid var(--leaf);display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}
        .mdr-eyebrow{font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--green);font-weight:800}
        .mdr-membername{font:800 21px Manrope,sans-serif;color:var(--navy);margin:4px 0 5px}
        .mdr-contact{font-size:10px;color:#536a70}
        .mdr-date{text-align:right;font-size:9px;color:var(--muted);line-height:1.65}
        .mdr-date strong{display:block;font:700 11px Manrope,sans-serif;color:var(--ink)}
        .mdr-section-label{display:flex;align-items:center;gap:10px;margin:2px 0 6px;font:800 11px Manrope,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--navy)}
        .mdr-section-label:after{content:"";height:1px;background:var(--rule);flex:1}
        .mdr-ident{border:1px solid var(--rule);background:rgba(255,255,255,.82);padding:7px 14px 5px;display:grid;grid-template-columns:1fr 1fr;column-gap:24px;row-gap:0}
        .mdr-detail{display:grid;grid-template-columns:120px minmax(0,1fr);align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid #edf1ed;font-size:10px;line-height:1.3;min-width:0}
        .mdr-detail:nth-last-child(-n+2){border-bottom:0}
        .mdr-detail span{color:var(--muted)}
        .mdr-detail strong{font-size:10.5px;color:var(--ink);font-weight:700;overflow-wrap:anywhere}
        .mdr-delivery{margin-top:12px}
        .mdr-product{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-1px 0 7px;padding:7px 12px;background:#edf3eb;border:1px solid #d4e1d2}
        .mdr-product small{display:block;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-bottom:3px}
        .mdr-product strong{font:700 12px Manrope,sans-serif;color:#285b40}
        .mdr-bag-count{white-space:nowrap;border-left:1px solid #cad9c9;padding-left:15px;text-align:right;color:var(--navy);font:700 12px Manrope,sans-serif}
        .mdr-weight-table{border-collapse:collapse;width:100%;border:1px solid var(--rule);background:#fff;font-size:10px}
        .mdr-weight-table th{text-align:left;background:#f0f3ef;padding:9px 12px;color:#62767b;text-transform:uppercase;letter-spacing:.09em;font-size:8px}
        .mdr-weight-table td{padding:7px 12px;border-top:1px solid #e6ece7;color:#53696f}
        .mdr-weight-table td:last-child{text-align:right;color:var(--navy);font:700 12px Manrope,sans-serif}
        .mdr-weight-table tr.mdr-net td{background:#f3f7f1;color:var(--green);font-weight:800}
        .mdr-settlement{margin-top:12px;border:1px solid #cad8d0;overflow:visible;flex-shrink:0}
        .mdr-settlement-head{display:flex;justify-content:space-between;align-items:center;background:var(--navy);color:#fff;padding:8px 15px;font:800 11px Manrope,sans-serif;letter-spacing:.07em;text-transform:uppercase}
        .mdr-settlement-head small{font:500 9px 'DM Sans',sans-serif;letter-spacing:0;color:#d6e4e4;text-transform:none}
        .mdr-lines{padding:2px 14px;background:#fff}
        .mdr-line{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:6px 1px;border-bottom:1px solid #e9eeea;font-size:10px;color:#556a6e}
        .mdr-line strong{font:700 11px Manrope,sans-serif;color:var(--ink);white-space:nowrap}
        .mdr-line small{display:block;font-size:8px;color:#82918e;margin-top:2px}
        .mdr-line.mdr-deduct strong{color:#8a6240}
        .mdr-total{background:var(--green);color:#fff;padding:10px 17px;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:76px;flex-shrink:0}
        .mdr-total-label{font:800 11px Manrope,sans-serif;text-transform:uppercase;letter-spacing:.1em}
        .mdr-total-label small{display:block;margin-top:4px;font:500 9px 'DM Sans',sans-serif;letter-spacing:0;text-transform:none;color:#d7e8da}
        .mdr-total-amount{text-align:right}
        .mdr-total-amount strong{display:block;font:800 22px Manrope,sans-serif;white-space:nowrap}
        .mdr-total-amount span{display:block;margin-top:3px;font-size:9px;color:#e2eee3;text-align:center}
        .mdr-status{margin:8px 0 0;display:flex;align-items:center;gap:8px;color:#536b6b;font-size:10px}
        .mdr-status b{color:#825e30}
        .mdr-statusdot{width:8px;height:8px;border-radius:50%;background:#d3a34d}
        .mdr-signatures{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:14px;flex-shrink:0}
        .mdr-signbox{border:1px solid var(--rule);min-height:96px;background:rgba(255,255,255,.76)}
        .mdr-signhead{padding:8px 11px;background:#f0f3ef;color:var(--navy);font-size:9px;font-weight:800;letter-spacing:.07em;text-transform:uppercase}
        .mdr-signname{padding:10px 11px 0;font-size:10px;color:#314d57;font-weight:700}
        .mdr-signline{margin:25px 11px 0;border-top:1px dashed #aebdb5;text-align:center;padding-top:5px;font-size:8px;color:#82918e}
        .mdr-footer{margin-top:auto;border-top:2px solid var(--leaf);padding-top:7px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;color:#71817e;font-size:9px;line-height:1.5;flex-shrink:0}
        .mdr-footer strong{font:700 10px Manrope,sans-serif;color:var(--navy)}
        .mdr-footer-note{text-align:right;max-width:230px}
        .mdr-bottomline{height:5px;position:absolute!important;bottom:0;left:0;right:0;background:linear-gradient(90deg,#d1a44e 0 4%,#173b5b 4% 78%,#397b58 78%)}
        @media(max-width:600px){
          .mdr-stage{padding:12px 0}
          .mdr-paper{padding:27px 26px 24px}
        }
        @media print{
          @page{size:A4 portrait;margin:0}
          html,body{width:210mm!important;height:297mm!important;margin:0!important;background:#fff!important}
          .mdr-stage{width:210mm!important;height:297mm!important;min-height:297mm!important;padding:0!important;background:#fff!important}
          .mdr-preview{width:210mm!important;height:297mm!important;aspect-ratio:auto!important;overflow:visible!important}
          .mdr-paper{width:210mm!important;height:297mm!important;min-height:297mm!important;left:0!important;top:0!important;transform:none!important;padding:9mm 11mm 8mm!important;box-shadow:none!important;overflow:hidden!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .mdr-ident,.mdr-weight-table,.mdr-settlement,.mdr-signbox{break-inside:avoid}
          .mdr-paper:before{display:none}
        }
      `}</style>
      <div className="mdr-preview" style={{ width: previewWidth, height: previewWidth * 297 / 210 }}>
        <article className="mdr-paper" style={{ transform: `translateX(-50%) scale(${previewWidth / 794})` }}>
          <div className="mdr-topline" />
          <header className="mdr-head">
            <div className="mdr-brand">
              <div className="mdr-mark" aria-hidden="true">C</div>
              <div><div className="mdr-brandname">Coop<em>Digital</em></div><div className="mdr-tagline">Ensemble, une coopérative plus forte</div></div>
            </div>
            <div className="mdr-title">
              <div className="mdr-kicker">CoopDigital · Producteur membre</div>
              <h1>BORDEREAU DE LIVRAISON</h1>
              <div className="mdr-ref">{preview.reference}</div>
            </div>
          </header>

          <section className="mdr-welcome" aria-label="Identification du producteur">
            <div>
              <div className="mdr-eyebrow">Producteur membre</div>
              <div className="mdr-membername">{preview.name}</div>
              <div className="mdr-contact">{preview.phone} <span aria-hidden="true">·</span> CNI {preview.cni}</div>
            </div>
            <div className="mdr-date"><strong>{preview.date}</strong>Pesée enregistrée à {preview.time}</div>
          </section>

          <section aria-label="Informations du membre">
            <div className="mdr-section-label">Repères du membre</div>
            <div className="mdr-ident">
              <Detail label="Groupement">{preview.group}</Detail>
              <Detail label="Section livraison">{preview.section}</Detail>
              <Detail label="Campagne">{preview.campaign}</Detail>
              <Detail label="Date de livraison">{preview.date}</Detail>
              <Detail label="Heure de pesée">{preview.time}</Detail>
              <Detail label="Référence">{preview.reference}</Detail>
            </div>
          </section>

          <section className="mdr-delivery" aria-label="Détail de la livraison">
            <div className="mdr-section-label">Détail de la livraison</div>
            <div className="mdr-product">
              <div><small>Produit / certification</small><strong>{preview.product}</strong></div>
              <div className="mdr-bag-count">{preview.bags}</div>
            </div>
            <table className="mdr-weight-table">
              <thead><tr><th>Pesée</th><th style={{ textAlign: "right" }}>Quantité enregistrée</th></tr></thead>
              <tbody>
                <tr><td>Poids brut reçu</td><td>{preview.grossWeight}</td></tr>
                <tr><td>Retenue de poids</td><td>− {preview.retention}</td></tr>
                <tr className="mdr-net"><td>Poids net retenu</td><td>{preview.netWeight}</td></tr>
                <tr><td>Prix unitaire</td><td>{preview.unitPrice}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="mdr-settlement" aria-label="Récapitulatif financier">
            <div className="mdr-settlement-head"><span>Récapitulatif financier</span><small>Montants en francs CFA</small></div>
            <div className="mdr-lines">
              <div className="mdr-line"><span>Montant brut</span><strong>{preview.grossAmount}</strong></div>
              <div className="mdr-line mdr-deduct"><span>Avance · {preview.advanceStatus}<small>{preview.advanceStatus} sur cette livraison</small></span><strong>− {preview.advance}</strong></div>
              <div className="mdr-line mdr-deduct"><span>Intrants déduits</span><strong>− {preview.inputs}</strong></div>
            </div>
            <div className="mdr-total">
              <div className="mdr-total-label">Montant net<small>Solde dû au producteur</small></div>
              <div className="mdr-total-amount">
                <strong>{new Intl.NumberFormat("fr-FR").format(preview.netAmount)} FCFA</strong>
                <span>{amountInWords(preview.netAmount)}</span>
              </div>
            </div>
          </section>

          <div className="mdr-status"><span className="mdr-statusdot" /><span>Statut du paiement : <b>{preview.paymentStatus}</b></span></div>

          <section className="mdr-signatures" aria-label="Signatures">
            <div className="mdr-signbox">
              <div className="mdr-signhead">Peseur / agent réceptionnaire</div>
              <div className="mdr-signname">{preview.receiver}</div>
              <div className="mdr-signline">Nom et signature</div>
            </div>
            <div className="mdr-signbox">
              <div className="mdr-signhead">Producteur / mandataire</div>
              <div className="mdr-signname">{preview.producer}</div>
              <div className="mdr-signline">Nom et signature</div>
            </div>
          </section>

          <footer className="mdr-footer">
            <div><strong>CoopDigital · Reçu de livraison membre</strong><br />Un exemplaire papier remis au producteur.</div>
            <div className="mdr-footer-note">Conservez cette référence pour tout échange avec votre coopérative.</div>
          </footer>
          <div className="mdr-bottomline" />
        </article>
      </div>
    </main>
  );
}
