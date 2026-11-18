import React from "react";

const components = [
  { label: "Salaire", amount: "Rétabli", kind: "note" },
  { label: "Salaire de base", amount: "750 000 FCFA" },
  { label: "Indemnités", amount: "50 000 FCFA" },
  { label: "Indemnité logement", amount: "150 000 FCFA" },
  { label: "Autres primes", amount: "100 000 FCFA" },
];

function getPreviewWidth() {
  if (typeof window === "undefined") return 794;
  return Math.min(794, Math.max(320, window.innerWidth - 24));
}

function Icon({ type, size = 22 }: { type: "coins" | "shield" | "hand" | "calendar" | "document"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (type === "coins") return <svg {...common}><ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v4c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 10v4c0 1.7 3.4 3 7.5 3M4.5 14v4c0 1.7 3.4 3 7.5 3"/><path d="M19.5 10v3m0 1v4m0 1v1"/></svg>;
  if (type === "shield") return <svg {...common}><path d="M12 3 20 6v5.1c0 5-3.4 8.4-8 10.9-4.6-2.5-8-5.9-8-10.9V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>;
  if (type === "hand") return <svg {...common}><path d="M3 13h4l2.1 2.1h5.1a2 2 0 0 0 2-2v-.2h-4.1"/><path d="m7 13 2.1-2.1a3 3 0 0 1 2.1-.9h3.3a2 2 0 0 1 2 2v.9l3.2-1.4a1.7 1.7 0 0 1 2.2.9 1.7 1.7 0 0 1-.8 2.2l-7.5 4.1a4 4 0 0 1-1.9.5H8.5L3 16.5Z"/><circle cx="17.5" cy="5.5" r="3"/><path d="M17.5 4v3m-1-2h2"/></svg>;
  if (type === "calendar") return <svg {...common}><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M7.5 3v5m9-5v5M4 10h16"/><path d="M8 13h2m4 0h2m-8 4h2m4 0h2"/></svg>;
  return <svg {...common}><path d="M6 3.5h8l4 4V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M14 3.5v5h5M8 12h8m-8 3h8"/></svg>;
}

export function BulletinPaie() {
  const [previewWidth, setPreviewWidth] = React.useState(getPreviewWidth);

  React.useEffect(() => {
    const resize = () => setPreviewWidth(getPreviewWidth());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <main className="bp-stage">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Manrope:wght@500;600;700;800&display=swap');
        .bp-stage,.bp-stage *{box-sizing:border-box}
        .bp-stage{--pine:#07593a;--deep:#06442f;--leaf:#2e8a4e;--lime:#75b84c;--gold:#d9a42b;--ink:#172d27;--muted:#64766d;--line:#d9e4dd;--paper:#fffefa;min-height:100dvh;background:#e9eeea;display:flex;justify-content:center;align-items:flex-start;padding:14px 8px;color:var(--ink);font-family:'DM Sans',sans-serif}
        .bp-preview{width:min(100%,794px);aspect-ratio:210/297;position:relative;flex:none}
        .bp-paper{position:absolute;top:0;left:50%;width:794px;height:1123px;transform-origin:top center;overflow:hidden;background:var(--paper);padding:29px 34px 27px;box-shadow:0 15px 50px rgba(23,57,39,.18);display:flex;flex-direction:column;gap:0}
        .bp-paper:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 3% 3%,rgba(218,237,223,.52),transparent 23%),radial-gradient(ellipse at 97% 84%,rgba(221,238,218,.44),transparent 21%);pointer-events:none}
        .bp-paper>*{position:relative;flex-shrink:0}
        .bp-topbar{position:absolute!important;top:0;left:0;right:0;height:7px;background:linear-gradient(90deg,var(--pine) 0 68%,#69a84a 68% 88%,var(--gold) 88%)}
        .bp-header{height:111px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:12px;gap:20px}
        .bp-brand{display:flex;align-items:center;gap:13px;min-width:0}
        .bp-logo{width:76px;height:76px;object-fit:contain;flex:none}
        .bp-brandname{font:800 30px/1 Manrope,sans-serif;letter-spacing:-1.4px;color:#143a2a;white-space:nowrap}
        .bp-brandname em{font-style:normal;color:#4f9e43}
        .bp-tagline{font-size:10px;font-weight:600;color:#55695e;margin-top:7px}
        .bp-headright{width:359px;min-height:80px;display:flex;flex-direction:column;justify-content:center;background:var(--deep);color:#fff;padding:12px 17px 9px 18px;border-radius:17px 0 0 4px;position:relative;overflow:hidden}
        .bp-headright:after{content:"";position:absolute;right:-30px;top:-57px;width:142px;height:142px;border:1px solid rgba(232,242,211,.35);border-radius:50%;box-shadow:0 0 0 10px rgba(210,231,187,.08),0 0 0 22px rgba(210,231,187,.06)}
        .bp-titleline{display:flex;align-items:center;gap:10px;position:relative;z-index:1}
        .bp-doctitle{font:800 19px/1.15 Manrope,sans-serif;letter-spacing:.015em}
        .bp-ref{font:700 13px/1.2 Manrope,sans-serif;margin:4px 0 8px 34px;letter-spacing:.025em;position:relative;z-index:1}
        .bp-meta{display:flex;justify-content:flex-end;gap:12px;align-items:center;font-size:9px;font-weight:700;color:#e7f0e9;white-space:nowrap}
        .bp-meta span{display:inline-flex;align-items:center;gap:5px}
        .bp-meta svg{width:14px;height:14px;color:#cde3d1}
        .bp-person{height:128px;margin-top:13px;border:1px solid #cbded0;border-radius:13px;background:linear-gradient(112deg,#f1f7ef,#f8f8f1);display:grid;grid-template-columns:1fr 1.05fr 84px;align-items:center;padding:13px 17px;gap:17px;position:relative;overflow:hidden}
        .bp-person:after{content:"";position:absolute;width:140px;height:140px;border-radius:50%;background:rgba(96,158,81,.055);right:36px;top:-90px}
        .bp-employee{padding-left:3px;z-index:1}
        .bp-eyebrow{font-size:9px;font-weight:800;color:var(--pine);letter-spacing:.12em;text-transform:uppercase}
        .bp-name{font:800 22px/1.12 Manrope,sans-serif;color:#183528;margin:5px 0 7px;letter-spacing:-.4px}
        .bp-detail{font-size:11px;line-height:1.48;color:#32473c}
        .bp-detail b{font-weight:700;color:#203b2e}
        .bp-period{border-left:1px solid #bdcfc3;padding:7px 0 7px 20px;z-index:1}
        .bp-period-main{font:800 17px/1.2 Manrope,sans-serif;color:#183a2b;margin:5px 0 8px}
        .bp-period .bp-detail{font-size:11px}
        .bp-status{height:74px;width:74px;border-radius:10px;background:linear-gradient(145deg,#148447,#006b3b);display:flex;align-items:center;justify-content:center;flex-direction:column;color:white;box-shadow:0 5px 12px rgba(16,89,51,.12);z-index:1}
        .bp-statusmark{width:31px;height:31px;border-radius:50%;background:#fff;color:#118047;display:grid;place-items:center;font-size:21px;font-weight:800;line-height:1}
        .bp-status small{font-size:8px;letter-spacing:.04em;font-weight:800;margin-top:5px}
        .bp-payhead{height:40px;margin-top:15px;border-radius:9px;background:linear-gradient(90deg,#07583a,#348a52 67%,#dcebdc);display:flex;align-items:center;gap:10px;color:#fff;padding:0 15px;font:800 14px Manrope,sans-serif;letter-spacing:.025em}
        .bp-payhead .bp-icon{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;color:#fff}
        .bp-gross{height:45px;margin-top:7px;border-radius:8px;background:#deeee0;display:flex;align-items:center;justify-content:space-between;padding:0 9px 0 15px;color:#183d2c}
        .bp-gross-label{font:800 15px Manrope,sans-serif;display:flex;align-items:center;gap:10px}
        .bp-gross-value{background:var(--deep);color:#fff;border-radius:7px;padding:8px 15px;font:800 17px Manrope,sans-serif;min-width:193px;text-align:right;white-space:nowrap}
        .bp-section{margin-top:11px;border-radius:9px;overflow:hidden;border:1px solid #ead6d6}
        .bp-sectionhead{height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 11px 0 14px;background:#f8e0e1;color:#8d1d25}
        .bp-section-title{font:800 13px Manrope,sans-serif;display:flex;align-items:center;gap:9px}
        .bp-miniicon{width:23px;height:23px;border-radius:50%;display:grid;place-items:center;background:#b92831;color:white}
        .bp-headamount{font-size:10px;font-weight:700;color:#fff;background:#bb202b;padding:5px 11px;border-radius:5px;min-width:145px;text-align:right}
        .bp-row{height:27px;display:flex;align-items:center;justify-content:space-between;padding:0 13px 0 55px;background:#fffafa;font-size:12px;border-top:1px solid rgba(129,47,47,.055)}
        .bp-row:nth-child(odd){background:#fdf4f4}
        .bp-row strong{font:700 12px Manrope,sans-serif;white-space:nowrap;color:#3b3030}
        .bp-regular{margin-top:12px;border:1px solid #d5e2d6;border-radius:9px;overflow:hidden}
        .bp-regularhead{height:34px;display:flex;align-items:center;justify-content:space-between;background:#dceee0;color:#184a31;padding:0 11px 0 14px}
        .bp-regularhead .bp-section-title{font-size:13px}
        .bp-regularhead .bp-miniicon{background:#1c7745}
        .bp-regularhead .bp-headamount{background:#218044}
        .bp-regular .bp-row{height:26px;background:#fbfcf9;border:0;border-top:1px solid #e9eee8;padding-left:55px;color:#293a31}
        .bp-regular .bp-row:nth-child(odd){background:#f2f5f1}
        .bp-regular .bp-row strong{color:#26372f}
        .bp-regular .bp-row:first-of-type strong{font-weight:500;color:#64746b}
        .bp-net{height:64px;margin-top:12px;border-radius:11px;background:linear-gradient(105deg,#06462f 0%,#07603a 63%,#168247 63%,#07713c 100%);color:white;display:flex;align-items:center;justify-content:space-between;padding:0 19px 0 22px;position:relative;overflow:hidden}
        .bp-net:after{content:"";position:absolute;width:120px;height:120px;border-radius:50%;right:98px;top:-76px;background:rgba(95,189,67,.2)}
        .bp-netlabel{display:flex;align-items:center;gap:13px;font:800 19px Manrope,sans-serif;letter-spacing:.02em;z-index:1}
        .bp-netcheck{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#16804b;font-size:24px;font-weight:800}
        .bp-netvalue{font:800 25px Manrope,sans-serif;white-space:nowrap;z-index:1}
        .bp-netvalue small{font-size:15px}
        .bp-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:13px;height:100px}
        .bp-stat{border:1px solid #d2ddd6;border-radius:10px;background:rgba(255,255,255,.82);display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;color:#253b30;padding:7px}
        .bp-staticon{color:#187947;height:26px;display:grid;place-items:center;margin-bottom:3px}
        .bp-statlabel{font-size:10px;line-height:1.25}
        .bp-statvalue{font:800 16px/1.2 Manrope,sans-serif;margin-top:3px;color:#182c23;white-space:nowrap}
        .bp-statunit{font-size:9px;color:#5f7066;margin-top:1px}
        .bp-signatures{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:14px 3px 0;height:90px}
        .bp-signbox{border:1px solid #d5dfd8;border-radius:10px;background:#f7f8f5;padding:9px 17px 8px;text-align:center;position:relative}
        .bp-signhead{font:800 11px Manrope,sans-serif;color:#253a30;letter-spacing:.035em}
        .bp-signline{border-top:1px solid #496257;width:80%;margin:22px auto 7px}
        .bp-signhint{font-size:9px;color:#46594f}
        .bp-footer{margin-top:auto;min-height:74px;border-top:2px solid #5d9f4d;display:flex;align-items:flex-end;justify-content:space-between;padding:10px 5px 3px;color:#4c6556;gap:16px}
        .bp-footer-left{font:italic 700 14px Georgia,serif;color:#306746}
        .bp-footer-left small{display:block;font:500 9px 'DM Sans',sans-serif;color:#64756b;margin-top:5px}
        .bp-footer-brand{text-align:right;font:800 14px Manrope,sans-serif;color:#17482f}
        .bp-dots{display:flex;justify-content:flex-end;gap:6px;margin-top:5px}
        .bp-dots i{width:6px;height:6px;background:#3b9948;border-radius:50%}
        .bp-dots i:last-child{background:#dda72a}
        .bp-bottom{height:7px;position:absolute!important;bottom:0;left:0;right:0;background:linear-gradient(90deg,#0a603a 0 73%,#68b64a 73% 91%,#d5a327 91%)}
        @media(max-width:600px){.bp-stage{padding:10px 0}}
        @media print{
          @page{size:A4 portrait;margin:0}
          html,body{width:210mm!important;height:297mm!important;margin:0!important;background:#fff!important}
          .bp-stage{width:210mm!important;height:297mm!important;min-height:297mm!important;padding:0!important;background:#fff!important}
          .bp-preview{width:210mm!important;height:297mm!important;aspect-ratio:auto!important}
          .bp-paper{width:210mm!important;height:297mm!important;left:0!important;top:0!important;transform:none!important;padding:7.7mm 9mm 7.1mm!important;box-shadow:none!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
      `}</style>
      <div className="bp-preview" style={{ width: previewWidth, height: previewWidth * 297 / 210 }}>
        <article className="bp-paper" style={{ transform: `translateX(-50%) scale(${previewWidth / 794})` }}>
          <div className="bp-topbar" />
          <header className="bp-header">
            <div className="bp-brand">
              <img className="bp-logo" src="/__mockup/images/coopdigital-logo.png" alt="CoopDigital" />
              <div><div className="bp-brandname">Coop<em>Digital</em></div><div className="bp-tagline">Ensemble pour une coopérative moderne</div></div>
            </div>
            <div className="bp-headright">
              <div className="bp-titleline"><Icon type="document" size={28} /><div className="bp-doctitle">BULLETIN DE PAIE</div></div>
              <div className="bp-ref">N° BP-2026-11-0001</div>
              <div className="bp-meta"><span><Icon type="calendar" size={14} />Période : Novembre 2026</span><span>Émis le : 17/11/2026</span></div>
            </div>
          </header>

          <section className="bp-person" aria-label="Identité et période du salarié">
            <div className="bp-employee">
              <div className="bp-eyebrow">Salarié</div>
              <div className="bp-name">ANGÉ GUEI</div>
              <div className="bp-detail"><b>Poste :</b> Développeur Web<br /><b>Matricule :</b> CD-2026-1147<br /><b>Service :</b> IT</div>
            </div>
            <div className="bp-period">
              <div className="bp-eyebrow">Période concernée</div>
              <div className="bp-period-main">Premier Novembre 2026</div>
              <div className="bp-detail"><b>Date d’entrée :</b> 01/01/2022<br /><b>Ancienneté :</b> 4 ans 10 mois</div>
            </div>
            <div className="bp-status"><span className="bp-statusmark">✓</span><small>AYANT DROIT</small></div>
          </section>

          <div className="bp-payhead"><span className="bp-icon"><Icon type="coins" size={23} /></span>ÉLÉMENTS DE PAIE</div>
          <section className="bp-gross" aria-label="Salaire brut"><div className="bp-gross-label"><Icon type="coins" size={24} />SALAIRE BRUT</div><div className="bp-gross-value">1 875 000 FCFA</div></section>

          <section className="bp-section" aria-label="Retenues salariales">
            <div className="bp-sectionhead"><div className="bp-section-title"><span className="bp-miniicon"><Icon type="shield" size={16} /></span>LES RETENUES</div><span className="bp-headamount">Montant total</span></div>
            <div className="bp-row"><span>CNPS (part salariale 8,75 %)</span><strong>− 164 063 FCFA</strong></div>
            <div className="bp-row"><span>Impôt sur le revenu (IRPP)</span><strong>− 180 625 FCFA</strong></div>
          </section>

          <section className="bp-regular" aria-label="Régularisation et composantes salariales">
            <div className="bp-regularhead"><div className="bp-section-title"><span className="bp-miniicon"><Icon type="coins" size={16} /></span>RÉGULARISATION</div><span className="bp-headamount">Montant</span></div>
            {components.map((item) => <div className="bp-row" key={item.label}><span>{item.label}</span><strong>{item.amount}</strong></div>)}
          </section>

          <section className="bp-net" aria-label="Net à payer">
            <div className="bp-netlabel"><span className="bp-netcheck">✓</span>NET À PAYER</div>
            <div className="bp-netvalue">100 380 <small>FCFA</small></div>
          </section>

          <section className="bp-summary" aria-label="Récapitulatif">
            <div className="bp-stat"><div className="bp-staticon"><Icon type="coins" size={24} /></div><div className="bp-statlabel">Salaire Brut</div><div className="bp-statvalue">1 875 000</div><div className="bp-statunit">FCFA</div></div>
            <div className="bp-stat"><div className="bp-staticon"><Icon type="shield" size={24} /></div><div className="bp-statlabel">Total Retenues</div><div className="bp-statvalue">344 688</div><div className="bp-statunit">FCFA</div></div>
            <div className="bp-stat"><div className="bp-staticon"><Icon type="hand" size={24} /></div><div className="bp-statlabel">Net à Payer</div><div className="bp-statvalue">100 380</div><div className="bp-statunit">FCFA</div></div>
            <div className="bp-stat"><div className="bp-staticon"><Icon type="calendar" size={24} /></div><div className="bp-statlabel">Période</div><div className="bp-statvalue" style={{ fontSize: 13 }}>Novembre 2026</div></div>
          </section>

          <section className="bp-signatures" aria-label="Signatures">
            <div className="bp-signbox"><div className="bp-signhead">LE DIRECTEUR</div><div className="bp-signline" /><div className="bp-signhint">Direction Générale - CoopDigital</div></div>
            <div className="bp-signbox"><div className="bp-signhead">LE SALARIÉ</div><div className="bp-signline" /><div className="bp-signhint">Signature</div></div>
          </section>

          <footer className="bp-footer">
            <div className="bp-footer-left">Ensemble, construisons un avenir digital<small>Côte d’Ivoire　·　Document de paie confidentiel</small></div>
            <div><div className="bp-footer-brand">CoopDigital</div><div className="bp-dots"><i /><i /><i /></div></div>
          </footer>
          <div className="bp-bottom" />
        </article>
      </div>
    </main>
  );
}
