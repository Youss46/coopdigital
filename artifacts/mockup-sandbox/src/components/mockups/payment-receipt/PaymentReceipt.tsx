import React from "react";

const receipt = {
  reference: "REC-2026-00101",
  beneficiary: "David Diabaté",
  phone: "08 08 08 08 08",
  cni: "CI-345678",
  campaign: "Campagne 2026-2027 (2026/2027)",
  weighingDate: "31/08/2026",
  settlementAt: "19/10/2026 à 17:57",
  method: "Espèces",
  transaction: "—",
  label: "Paiement livraison cacao",
  weighingReceipt: "FESS-2026-00019",
  situation: "Montant encaissé",
  installment: "700 000 FCFA",
  balance: "0 FCFA",
  deliveryStatus: "RÉGLÉE",
  paymentStatus: "PAYÉ",
  validator: "Yérin Bakayoko (PCA)",
};

const rows = [
  ["N° Reçu", receipt.reference],
  ["Campagne", receipt.campaign],
  ["Date de pesée", receipt.weighingDate],
  ["Date et heure de règlement", receipt.settlementAt],
  ["Mode de paiement", receipt.method],
  ["Référence transaction", receipt.transaction],
  ["Libellé", receipt.label],
  ["N° de pesée", receipt.weighingReceipt],
  ["Situation", receipt.situation],
];

function getPreviewWidth() {
  if (typeof window === "undefined") return 620;
  return Math.min(794, Math.max(320, window.innerWidth - 32));
}

export function PaymentReceipt() {
  const [previewWidth, setPreviewWidth] = React.useState(getPreviewWidth);

  React.useEffect(() => {
    const resize = () => setPreviewWidth(getPreviewWidth());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <main className="pr-stage">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Manrope:wght@500;600;700;800&display=swap');
        .pr-stage,.pr-stage *{box-sizing:border-box}
        .pr-stage{--forest:#075c39;--deep:#073f2b;--leaf:#4b9a4a;--lime:#b5df71;--gold:#d99b2b;--ink:#102c27;--muted:#647873;--rule:#dce6df;--paper:#fffefa;min-height:100dvh;background:#e8eeea;display:flex;justify-content:center;align-items:flex-start;padding:16px 8px;color:var(--ink);font-family:'DM Sans',sans-serif}
        .pr-preview{width:min(100%,794px);aspect-ratio:210/297;position:relative;flex:none}
        .pr-paper{position:absolute;top:0;left:50%;width:794px;height:1123px;transform-origin:top center;overflow:hidden;background:var(--paper);padding:33px 36px 28px;box-shadow:0 14px 45px rgba(21,62,44,.17);display:flex;flex-direction:column}
        .pr-paper:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 88% 13%,rgba(202,226,175,.3),transparent 24%),radial-gradient(ellipse at 5% 83%,rgba(236,218,167,.15),transparent 25%);pointer-events:none}
        .pr-paper>*{position:relative;flex-shrink:0}
        .pr-topline{height:8px;position:absolute!important;top:0;left:0;right:0;background:linear-gradient(105deg,#075c39 0 57%,#93ca55 57% 80%,#d99b2b 80%)}
        .pr-header{height:125px;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:2px 0 14px;border-bottom:1px solid var(--rule)}
        .pr-brand{display:flex;align-items:center;gap:12px;min-width:0}
        .pr-logo{width:68px;height:68px;border:4px solid #e6eee6;border-radius:50%;display:grid;place-items:center;position:relative;flex:none;background:radial-gradient(circle at 56% 46%,#f8f8e9 0 24%,transparent 25%),linear-gradient(135deg,#d6eb9e 0 18%,#1d7548 19% 65%,#064c34 66%);box-shadow:inset 0 0 0 2px #fff}
        .pr-logo:before{content:"";position:absolute;width:18px;height:34px;left:23px;top:14px;border-radius:90% 8% 90% 10%;transform:rotate(25deg);background:linear-gradient(90deg,#e9a329 0 24%,#f8d76a 25% 34%,#bd7020 35% 60%,#f5b537 61%);border:1px solid rgba(255,255,255,.8)}
        .pr-logo:after{content:"";position:absolute;width:17px;height:10px;right:6px;top:7px;background:#6ba745;border-radius:90% 0 90% 0;transform:rotate(-16deg)}
        .pr-brandname{font:800 31px/1 Manrope,sans-serif;letter-spacing:-1.3px;color:#132844;white-space:nowrap}
        .pr-brandname em{font-style:normal;color:#4c9a43}
        .pr-tagline{font-size:10px;font-style:italic;color:#42584d;margin-top:6px;font-weight:700}
        .pr-headrule{height:72px;width:1px;background:#789086;margin:0 5px}
        .pr-title{position:relative;align-self:stretch;display:flex;flex-direction:column;justify-content:center;min-width:250px;padding:0 16px 0 20px;color:#fff;background:linear-gradient(110deg,#075638,#033f2a);border-radius:0 0 0 42px;overflow:hidden}
        .pr-title:after{content:"";position:absolute;width:145px;height:145px;right:-33px;top:-61px;border:1px solid rgba(205,232,168,.24);border-radius:50%;box-shadow:0 0 0 12px rgba(205,232,168,.06),0 0 0 24px rgba(205,232,168,.05)}
        .pr-title-top{display:flex;align-items:center;gap:11px;position:relative;z-index:1}
        .pr-check{width:40px;height:40px;border:3px solid #f1f8ec;border-radius:50%;display:grid;place-items:center;font-size:24px;font-weight:800;line-height:1;flex:none}
        .pr-kicker{font-size:9px;letter-spacing:.17em;text-transform:uppercase;color:#d6e8cb;font-weight:800}
        .pr-title h1{margin:3px 0 0;font:800 19px/1.1 Manrope,sans-serif;letter-spacing:.015em}
        .pr-ref{margin:8px 0 0 51px;font:800 15px Manrope,sans-serif;letter-spacing:.04em;white-space:nowrap;position:relative;z-index:1}
        .pr-issued{margin:6px 0 0 51px;font-size:9px;color:#dbe9df;position:relative;z-index:1}
        .pr-beneficiary{margin:12px 0 14px;min-height:96px;position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 18px;background:linear-gradient(105deg,#f0f5ed,#f8f8f1);border:1px solid #d9e4d9;border-radius:10px;overflow:hidden}
        .pr-beneficiary:after{content:none}
        .pr-person{position:relative;z-index:1}
        .pr-eyebrow{font-size:9px;font-weight:800;color:var(--forest);letter-spacing:.13em;text-transform:uppercase}
        .pr-name{font:800 22px/1.2 Manrope,sans-serif;color:#132b34;margin:4px 0 7px}
        .pr-contact{font-size:11px;color:#4c625c}
        .pr-contact b{color:#153e32}
        .pr-date{align-self:stretch;display:flex;align-items:center;text-align:right;border-left:1px solid #cad8ce;padding:7px 10px 7px 16px;z-index:1;font-size:11px;line-height:1.55;color:#536a61;background:rgba(255,255,255,.72);border-radius:7px;min-width:158px}
        .pr-date strong{display:block;color:#173b2c;font:700 11px Manrope,sans-serif}
        .pr-section{font:800 12px Manrope,sans-serif;letter-spacing:.09em;text-transform:uppercase;color:#fff;background:linear-gradient(90deg,#075c39,#1a874b 76%,#76bf48);padding:10px 15px;display:flex;align-items:center;gap:10px;border-radius:8px 8px 0 0}
        .pr-section-mark{width:21px;height:22px;border:2px solid rgba(255,255,255,.92);border-radius:3px;position:relative;flex:none}
        .pr-section-mark:before,.pr-section-mark:after{content:"";position:absolute;left:4px;right:4px;height:2px;background:#fff}
        .pr-section-mark:before{top:5px;box-shadow:0 5px 0 #fff}
        .pr-section-mark:after{top:15px;right:8px}
        .pr-details{border:1px solid #d9e3dc;border-top:0;background:rgba(255,255,255,.92);padding:7px 16px 6px;border-radius:0 0 9px 9px}
        .pr-row{min-height:32px;display:grid;grid-template-columns:244px 15px minmax(0,1fr);align-items:center;border-bottom:1px solid #e9eeea;font-size:12px;line-height:1.25}
        .pr-row:last-child{border-bottom:0}
        .pr-label{color:#586d67;display:flex;align-items:center;gap:10px}
        .pr-label:before{content:"";width:7px;height:7px;border-radius:2px;background:#5b9d58;box-shadow:0 0 0 3px #edf5e8;flex:none}
        .pr-colon{color:#83928c;text-align:center}
        .pr-value{font:700 12px Manrope,sans-serif;color:#182d35;overflow-wrap:anywhere}
        .pr-row:nth-child(4) .pr-value,.pr-row:nth-child(9) .pr-value{color:#17613b}
        .pr-situation{display:inline-flex;align-items:center;gap:7px;background:#e5f4d9;border-radius:30px;padding:3px 11px 3px 5px;color:#286a35}
        .pr-situation i{font-style:normal;background:#218741;color:#fff;width:18px;height:18px;display:grid;place-items:center;border-radius:50%;font-size:13px}
        .pr-amounts{margin-top:11px;border:1px solid #b8d8b3;border-radius:9px;overflow:hidden;background:#eff8e9}
        .pr-amount-line{min-height:37px;padding:7px 17px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:#244837;font-size:12px;font-weight:700;border-bottom:1px solid #dcebd5}
        .pr-amount-line span:first-child{display:flex;align-items:center;gap:10px}
        .pr-amount-line span:first-child:before{content:"";width:18px;height:18px;border:2px solid #4d9a4f;border-radius:50%;flex:none}
        .pr-amount-line strong{font:800 15px Manrope,sans-serif;color:#173b2e;white-space:nowrap}
        .pr-amount-line.balance{background:#e7f4df}
        .pr-amount-line.status{background:#d9f0c8;border-bottom:0;color:#176034}
        .pr-amount-line.status span:first-child:before{content:"✓";display:grid;place-items:center;background:#278545;color:#fff;border-color:#278545;font-size:13px}
        .pr-grand{margin-top:11px;min-height:67px;border-radius:10px;background:linear-gradient(100deg,#075638,#0d7542);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:10px 20px;box-shadow:inset 0 -3px 0 rgba(0,0,0,.08)}
        .pr-grand-label{display:flex;align-items:center;gap:12px;font:800 16px Manrope,sans-serif;letter-spacing:.045em;text-transform:uppercase}
        .pr-coins{width:30px;height:29px;border-radius:50%;border:3px double #e5f1dd;position:relative;display:block}
        .pr-coins:before{content:"";position:absolute;width:18px;height:8px;left:3px;top:-5px;border:2px solid #e5f1dd;border-radius:50%;background:#247344}
        .pr-grand strong{font:800 23px Manrope,sans-serif;white-space:nowrap}
        .pr-validation{margin-top:9px;min-height:58px;background:#edf2f6;border:1px solid #dce4e8;border-radius:9px;display:flex;align-items:center;justify-content:center;gap:14px;color:#40564f}
        .pr-validation-mark{width:27px;height:27px;background:#218747;color:#fff;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:19px}
        .pr-validation strong{font:800 15px Manrope,sans-serif;color:#1d7139}
        .pr-validation small{display:block;margin-top:2px;font-size:10px;color:#354a4b}
        .pr-signatures{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:14px 10px 0}
        .pr-signbox{height:105px;border:1px solid #cfddd4;border-radius:10px;background:#fafbf8;padding:0 10px 9px}
        .pr-signhead{height:34px;display:flex;align-items:center;justify-content:center;gap:9px;color:#193a34;font:800 11px Manrope,sans-serif}
        .pr-sign-icon{width:20px;height:16px;border-bottom:2px solid #234c42;position:relative}
        .pr-sign-icon:before{content:"";position:absolute;width:13px;height:5px;left:4px;top:1px;border:2px solid #234c42;border-radius:7px 7px 2px 2px}
        .pr-sign-inner{height:59px;border:1.5px solid #69a57a;border-radius:7px;background:#fff}
        .pr-footer{margin-top:auto;min-height:67px;border-top:2px solid #65aa45;padding:9px 3px 0;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;color:#62756b;font-size:9px;line-height:1.5}
        .pr-footer-brand{font:italic 700 15px Georgia,serif;color:#2c6744}
        .pr-footer-left{white-space:nowrap}
        .pr-footer-links{margin-top:5px;color:#50645c;font-size:9px}
        .pr-footer-links b{color:#174a35}
        .pr-footer-note{text-align:right;max-width:240px;color:#4d6358}
        .pr-bottomline{height:6px;position:absolute!important;bottom:0;left:0;right:0;background:linear-gradient(90deg,#d99b2b 0 4%,#0a5738 4% 78%,#57a842 78%)}
        @media(max-width:600px){
          .pr-stage{padding:12px 0}
          .pr-paper{padding:28px 25px 22px}
        }
        @media print{
          @page{size:A4 portrait;margin:0}
          html,body{width:210mm!important;height:297mm!important;margin:0!important;background:#fff!important}
          .pr-stage{width:210mm!important;height:297mm!important;min-height:297mm!important;padding:0!important;background:#fff!important}
          .pr-preview{width:210mm!important;height:297mm!important;aspect-ratio:auto!important;overflow:visible!important}
          .pr-paper{width:210mm!important;height:297mm!important;min-height:297mm!important;left:0!important;top:0!important;transform:none!important;padding:8.7mm 9.5mm 7.4mm!important;box-shadow:none!important;overflow:hidden!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .pr-details,.pr-amounts,.pr-signbox,.pr-grand{break-inside:avoid}
          .pr-paper:before{display:none}
        }
      `}</style>
      <div className="pr-preview" style={{ width: previewWidth, height: previewWidth * 297 / 210 }}>
        <article className="pr-paper" style={{ transform: `translateX(-50%) scale(${previewWidth / 794})` }}>
          <div className="pr-topline" />
          <header className="pr-header">
            <div className="pr-brand">
              <div className="pr-logo" aria-hidden="true" />
              <div>
                <div className="pr-brandname">Coop<em>Digital</em></div>
                <div className="pr-tagline">Ensemble pour une coopérative moderne</div>
              </div>
            </div>
            <div className="pr-headrule" />
            <div className="pr-title">
              <div className="pr-title-top">
                <span className="pr-check" aria-hidden="true">✓</span>
                <div><div className="pr-kicker">Règlements · CoopDigital</div><h1>REÇU DE PAIEMENT</h1></div>
              </div>
              <div className="pr-ref">N° {receipt.reference}</div>
              <div className="pr-issued">Émis le 06 novembre 2026</div>
            </div>
          </header>

          <section className="pr-beneficiary" aria-label="Bénéficiaire">
            <div className="pr-person">
              <div className="pr-eyebrow">Bénéficiaire</div>
              <div className="pr-name">{receipt.beneficiary}</div>
              <div className="pr-contact"><b>Tél.</b> {receipt.phone}<span aria-hidden="true">　·　</span><b>CNI</b> {receipt.cni}</div>
            </div>
            <div className="pr-date"><div><strong>Reçu de règlement</strong>Justificatif de paiement<br />à conserver</div></div>
          </section>

          <section aria-label="Détails du paiement">
            <div className="pr-section"><span className="pr-section-mark" aria-hidden="true" />Détails du paiement</div>
            <div className="pr-details">
              {rows.map(([label, value]) => (
                <div className="pr-row" key={label}>
                  <span className="pr-label">{label}</span><span className="pr-colon">:</span>
                  <strong className="pr-value">
                    {label === "Situation" ? <span className="pr-situation"><i>✓</i>{value}</span> : value}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section className="pr-amounts" aria-label="Montants du règlement">
            <div className="pr-amount-line">
              <span>Montant encaissé — règlement 3</span><strong>{receipt.installment}</strong>
            </div>
            <div className="pr-amount-line balance">
              <span>Reste dû</span><strong>{receipt.balance}</strong>
            </div>
            <div className="pr-amount-line status">
              <span>Statut livraison : {receipt.deliveryStatus}</span><strong>Réglée</strong>
            </div>
          </section>

          <section className="pr-grand" aria-label="Montant encaissé">
            <div className="pr-grand-label"><span className="pr-coins" aria-hidden="true" />Montant encaissé</div>
            <strong>{receipt.installment}</strong>
          </section>

          <section className="pr-validation" aria-label="Validation du paiement">
            <span className="pr-validation-mark" aria-hidden="true">✓</span>
            <div><strong>Statut : {receipt.paymentStatus}</strong><small>Validé par : <b>{receipt.validator}</b></small></div>
          </section>

          <section className="pr-signatures" aria-label="Signatures">
            <div className="pr-signbox">
              <div className="pr-signhead"><span className="pr-sign-icon" aria-hidden="true" />Caissier / Agent payeur</div>
              <div className="pr-sign-inner" />
            </div>
            <div className="pr-signbox">
              <div className="pr-signhead"><span className="pr-sign-icon" aria-hidden="true" />Bénéficiaire</div>
              <div className="pr-sign-inner" />
            </div>
          </section>

          <footer className="pr-footer">
            <div className="pr-footer-left">
              <div className="pr-footer-brand">CoopDigital, la digitalisation au service des coopératives</div>
              <div className="pr-footer-links"><b>Côte d’Ivoire</b>　│　 <b>www.coopdigital.ci</b></div>
            </div>
            <div className="pr-footer-note">Conservez ce reçu pour tout échange avec votre coopérative.</div>
          </footer>
          <div className="pr-bottomline" />
        </article>
      </div>
    </main>
  );
}
