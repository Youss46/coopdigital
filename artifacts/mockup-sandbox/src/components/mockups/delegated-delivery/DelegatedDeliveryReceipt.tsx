import React from "react";

const Icon = ({ kind, size = 18 }: { kind: string; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    document: <><path d="M6 2h9l5 5v15H6z" /><path d="M15 2v5h5M9 11h7M9 15h7M9 19h5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18M8 14h2M14 14h2M8 17h2" /></>,
    person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-1a7 7 0 0 1 14 0v1z" /></>,
    scale: <><path d="M12 3v17M5 7h14M8 7l-4 7h8zM20 14l-4-7-4 7zM7 21h10" /></>,
    truck: <><path d="M2 6h12v11H2zM14 10h4l4 4v3h-8z" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    coin: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.6-.7-1.5-1-2.7-1-1.6 0-2.7.8-2.7 2s1.1 1.8 2.8 2.2 2.8 1 2.8 2.3-1.1 2.3-3 2.3c-1.2 0-2.3-.4-3-1.2M12 5.5v13" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[kind]}</svg>;
};

const Field = ({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) => (
  <div className={`receipt-field ${wide ? "wide" : ""}`}>
    <span>{label}</span><strong>{value}</strong>
  </div>
);

function VerificationCode() {
  const cells = [
    "111111101001101111111", "100000101110001000001", "101110101010101011101",
    "101110100101001011101", "101110101101101011101", "100000100011101000001",
    "111111101010101111111", "000000001101000000000", "110101110010111010110",
    "011010001110000110101", "101101110011101101001", "001011001101010010110",
    "110100111000110111001", "000000001011101010010", "111111101100011101101",
    "100000101011100010010", "101110101101011101111", "101110100010110001001",
    "101110101111001110100", "100000101010110011011", "111111101101011101101",
  ];
  return <div className="qr-grid" aria-label="Code de vérification décoratif">{cells.join("").split("").map((cell, i) => <i key={i} className={cell === "1" ? "on" : ""} />)}</div>;
}

export function DelegatedDeliveryReceipt() {
  return (
    <main className="receipt-stage">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box}
        .receipt-stage{--navy:#102e50;--navy2:#173d63;--leaf:#398b41;--leaf-dark:#17632c;--mint:#e7f2e8;--ink:#182b3d;--muted:#637485;--rule:#d5dee5;--paper:#fff;--soft:#f4f7f8;min-height:100dvh;background:#e9eff0;padding:30px 16px;color:var(--ink);font-family:'DM Sans',sans-serif}
        .receipt{width:min(100%,820px);min-height:1120px;margin:0 auto;background:var(--paper);box-shadow:0 18px 54px rgba(16,46,80,.16);position:relative;overflow:hidden;padding:27px 30px 24px}
        .receipt:before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse at 92% 24%,rgba(81,153,92,.075),transparent 23%),radial-gradient(ellipse at 5% 76%,rgba(16,46,80,.035),transparent 28%);pointer-events:none}
        .topline{height:5px;position:absolute;top:0;left:0;right:0;background:linear-gradient(90deg,var(--leaf) 0 32%,#a8ce55 32% 36%,var(--navy) 36%)}
        .receipt-header{display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--rule);padding:5px 0 17px;position:relative}
        .brand{display:flex;align-items:center;gap:13px;min-width:0}
        .brand-mark{width:54px;height:54px;display:grid;place-items:center;border-radius:18px 18px 18px 4px;background:var(--leaf);color:#fff;position:relative;transform:rotate(-3deg)}
        .brand-mark:after{content:"";position:absolute;width:27px;height:27px;border:2px solid rgba(255,255,255,.75);border-radius:50%;transform:rotate(40deg);border-top-color:transparent}
        .brand-mark b{font-family:Georgia,serif;font-size:25px;font-style:italic;z-index:1}
        .brand-name{font-family:Manrope,sans-serif;font-size:27px;font-weight:800;letter-spacing:-1.5px;color:var(--navy);line-height:1}
        .brand-name span{color:var(--leaf)}
        .brand-sub{font-size:10px;color:#526578;letter-spacing:.03em;margin-top:5px}
        .doc-title{border-left:1px solid var(--rule);padding-left:20px;text-align:right;flex:0 0 auto}
        .doc-kicker{font-size:9px;color:var(--leaf-dark);font-weight:800;letter-spacing:.16em;text-transform:uppercase;margin-bottom:4px}
        .doc-title h1{margin:0;font:800 17px Manrope,sans-serif;color:var(--navy);letter-spacing:.01em}
        .receipt-ref{font:700 12px 'DM Sans',sans-serif;color:#fff;background:var(--navy);display:inline-block;margin-top:7px;padding:5px 10px;border-radius:4px;letter-spacing:.06em}
        .meta-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0 10px}
        .meta-chip{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:6px;background:#f0f4f6;font-size:11px;color:#53677a}
        .meta-chip svg{color:var(--leaf);flex:none}
        .meta-chip b{color:var(--ink);font-size:11px}
        .product-line{display:flex;align-items:center;justify-content:flex-end;margin-bottom:15px}
        .product-pill{display:inline-flex;align-items:center;gap:8px;padding:6px 13px;border:1px solid #b4d6b7;background:var(--mint);color:#245d2d;border-radius:99px;font-size:11px;font-weight:800}
        .product-dot{width:7px;height:7px;border-radius:50%;background:var(--leaf)}
        .info-grid{display:grid;grid-template-columns:1.02fr .98fr;gap:13px}
        .panel{border:1px solid var(--rule);border-radius:7px;overflow:hidden;background:rgba(255,255,255,.94)}
        .panel-head{display:flex;align-items:center;gap:9px;background:var(--navy);color:#fff;padding:9px 12px;font:800 11px Manrope,sans-serif;letter-spacing:.055em;text-transform:uppercase}
        .panel-head svg{color:#dce9f3}
        .panel-body{padding:11px 13px}
        .fields{display:grid;grid-template-columns:1fr 1fr;column-gap:14px}
        .receipt-field{display:grid;grid-template-columns:87px minmax(0,1fr);align-items:baseline;gap:5px;padding:3px 0;font-size:10px;line-height:1.25}
        .receipt-field span{color:#687b8c}
        .receipt-field strong{font-size:10.5px;color:#1c3042;font-weight:700;overflow-wrap:anywhere}
        .receipt-field.wide{grid-column:1/-1}
        .status{display:inline-flex;align-items:center;gap:5px;color:#1f6b31!important}
        .status-mark{width:14px;height:14px;border-radius:50%;background:#3c9a4f;color:white;display:grid;place-items:center}
        .pass-table{width:100%;border-collapse:collapse;font-size:10px}
        .pass-table th{background:#edf3f5;color:#52677a;text-align:left;font-size:8px;letter-spacing:.07em;text-transform:uppercase;padding:8px 6px;border-bottom:1px solid var(--rule)}
        .pass-table td{padding:10px 6px;border-bottom:1px solid #e6ecef;color:#20374b;font-weight:600}
        .pass-table tbody tr:last-child td{border-bottom:0}
        .pass-table td:first-child{color:var(--leaf-dark);font-weight:800}
        .pass-note{display:flex;justify-content:space-between;align-items:center;margin-top:6px;padding-top:8px;border-top:1px dashed var(--rule);font-size:9px;color:var(--muted)}
        .pass-note b{color:var(--navy);font-size:10px}
        .settlement{margin-top:14px;border:1px solid #b9c9d5;border-radius:7px;overflow:hidden}
        .settlement-title{display:flex;align-items:center;justify-content:space-between;background:var(--navy);color:white;padding:9px 12px;font:800 11px Manrope,sans-serif;letter-spacing:.06em;text-transform:uppercase}
        .settlement-title span{display:flex;align-items:center;gap:8px}
        .settlement-title small{font:500 9px 'DM Sans',sans-serif;color:#d3e1ec;text-transform:none;letter-spacing:0}
        .settlement-grid{display:grid;grid-template-columns:repeat(5,1fr) 1.17fr}
        .metric{min-height:88px;border-right:1px solid var(--rule);display:flex;flex-direction:column;justify-content:space-between;padding:10px 9px 12px;text-align:center;background:#fbfcfc}
        .metric:last-child{border:0}
        .metric-label{font-size:8px;font-weight:800;letter-spacing:.045em;text-transform:uppercase;color:#627589;line-height:1.35}
        .metric-value{font:800 14px Manrope,sans-serif;color:var(--navy);white-space:nowrap}
        .metric-value small{font:700 9px 'DM Sans',sans-serif;color:#52677a}
        .charges{padding:9px 11px;background:#f5f8f6;border-left:1px solid var(--rule);display:flex;flex-direction:column;gap:5px}
        .charge{display:flex;justify-content:space-between;gap:6px;font-size:9px;color:#5b6f7f}
        .charge b{color:#30475a;font-weight:700;white-space:nowrap}
        .charge.total-deduct{border-top:1px solid #cfdad2;padding-top:5px;color:#42604a;font-weight:700}
        .pay-row{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin-top:11px}
        .pay-copy{border:1px solid var(--rule);border-radius:7px;padding:10px 13px;display:flex;align-items:center;gap:11px;background:#f5f8f6}
        .pay-check{width:31px;height:31px;flex:none;border-radius:50%;background:var(--leaf);display:grid;place-items:center;color:#fff}
        .pay-copy strong{display:block;font:800 12px Manrope,sans-serif;color:var(--navy)}
        .pay-copy em{display:block;font-size:10px;color:#5b6d7b;margin-top:3px}
        .pay-total{background:var(--leaf-dark);color:#fff;border-radius:7px;padding:13px 17px;text-align:center;min-width:204px}
        .pay-total small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.12em;color:#cbe6cf;margin-bottom:3px;font-weight:700}
        .pay-total b{font:800 20px Manrope,sans-serif;white-space:nowrap}
        .signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:14px}
        .sign-box{border:1px solid var(--rule);border-radius:6px;min-height:102px;overflow:hidden}
        .sign-head{display:flex;align-items:center;gap:7px;background:#eff3f5;color:var(--navy);padding:7px 9px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
        .sign-head svg{color:var(--leaf-dark)}
        .sign-body{padding:8px 10px;font-size:9px;color:#647788}
        .sign-name{font-weight:700;color:#2b4153;margin-bottom:3px}
        .sign-line{margin-top:30px;border-top:1px dashed #bac8d1;text-align:center;padding-top:4px;font-size:8px;color:#8a9aa7}
        .footer{display:flex;justify-content:space-between;align-items:flex-end;border-top:2px solid var(--leaf);margin-top:15px;padding-top:9px;gap:10px}
        .footer-copy{font-size:9px;color:#637587;line-height:1.55}
        .footer-copy b{color:var(--navy);font-size:10px}
        .verify{display:flex;align-items:center;gap:8px}
        .verify-text{text-align:right;font-size:8px;color:#637587;line-height:1.4}
        .verify-text strong{display:block;color:var(--navy);font-size:9px}
        .qr-grid{display:grid;grid-template-columns:repeat(21,3px);grid-template-rows:repeat(21,3px);padding:4px;background:white;border:1px solid #d5dee5;gap:0;flex:none}
        .qr-grid i.on{background:var(--navy)}
        .legal-note{position:absolute;bottom:5px;left:30px;font-size:7px;color:#94a1ab;letter-spacing:.025em}
        @media(max-width:640px){
          .receipt-stage{padding:0;background:#e9eff0}
          .receipt{width:100%;min-height:100dvh;padding:18px 14px 26px;box-shadow:none}
          .receipt-header{gap:9px;padding-bottom:13px}
          .brand-mark{width:42px;height:42px;border-radius:14px 14px 14px 4px}
          .brand-mark b{font-size:20px}
          .brand-name{font-size:21px}
          .brand-sub{font-size:8px}
          .doc-title{padding-left:10px}
          .doc-title h1{font-size:13px}
          .doc-kicker{font-size:7px}
          .receipt-ref{font-size:9px;padding:4px 7px}
          .meta-row{gap:6px;margin:11px 0 8px}
          .meta-chip{padding:8px 7px;font-size:9px;gap:6px}
          .meta-chip b{font-size:9px}
          .product-line{margin-bottom:11px}
          .info-grid{grid-template-columns:1fr;gap:9px}
          .panel-head{padding:8px 10px}
          .panel-body{padding:9px 10px}
          .receipt-field{grid-template-columns:105px 1fr;font-size:10px}
          .receipt-field strong{font-size:10px}
          .pass-table th{padding:7px 5px;font-size:7px}
          .pass-table td{padding:8px 5px;font-size:9px}
          .settlement{margin-top:10px}
          .settlement-title{padding:8px 9px;font-size:9px}
          .settlement-title small{font-size:8px}
          .settlement-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
          .metric{min-height:67px;padding:8px 5px;border-bottom:1px solid var(--rule)}
          .metric:nth-child(3){border-right:0}
          .metric-value{font-size:12px}
          .charges{grid-column:span 2;border-left:0}
          .charges .charge{font-size:9px}
          .pay-row{grid-template-columns:1fr;gap:7px}
          .pay-total{min-width:0;padding:10px}
          .pay-total b{font-size:19px}
          .signatures{grid-template-columns:1fr;gap:7px;margin-top:10px}
          .sign-box{min-height:76px}
          .sign-line{margin-top:17px}
          .footer{margin-top:11px}
          .legal-note{left:14px;bottom:4px}
        }
        @media print{
          @page{size:A4 portrait;margin:8mm}
          html,body{background:#fff!important;margin:0!important}
          .receipt-stage{min-height:0!important;padding:0!important;background:#fff!important}
          .receipt{width:100%!important;min-height:0!important;height:auto!important;margin:0!important;padding:7mm!important;box-shadow:none!important;overflow:visible!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
          .topline{top:0}
          .panel,.settlement,.sign-box{break-inside:avoid}
          .receipt:before{display:none}
          .legal-note{bottom:1mm;left:7mm}
        }
      `}</style>
      <article className="receipt">
        <div className="topline" />
        <header className="receipt-header">
          <div className="brand">
            <div className="brand-mark"><b>C</b></div>
            <div><div className="brand-name">Coop<span>Digital</span></div><div className="brand-sub">Ensemble pour une coopérative moderne</div></div>
          </div>
          <div className="doc-title">
            <div className="doc-kicker">Bordereau de réception</div>
            <h1>ACHAT DÉLÉGUÉ</h1>
            <div className="receipt-ref">PE-5-2026-00037</div>
          </div>
        </header>

        <div className="meta-row">
          <div className="meta-chip"><Icon kind="calendar" size={16} /><span>Campagne&nbsp; <b>2026–2027</b></span></div>
          <div className="meta-chip"><Icon kind="calendar" size={16} /><span>Date&nbsp; <b>10/09/2026 à 13:22</b></span></div>
        </div>
        <div className="product-line"><span className="product-pill"><span className="product-dot" />Cacao ASR_100</span></div>

        <section className="info-grid">
          <div className="panel">
            <div className="panel-head"><Icon kind="person" />Identification du délégué</div>
            <div className="panel-body fields">
              <Field label="Délégué" value="Siaka Koné" />
              <Field label="Téléphone" value="07 07 77 11 53" />
              <Field label="Section" value="—" />
              <Field label="N° camion" value="AA-234" />
              <Field label="Chauffeur" value="KONE SIAKA" />
              <Field label="Ouverture" value="10/09/2026 à 13:22" />
              <Field label="Clôture" value="10/09/2026 à 13:22" />
              <Field label="Passages" value="2 pesées" />
              <Field label="Paiement" value={<span className="status"><span className="status-mark"><Icon kind="check" size={10} /></span>Payé</span>} />
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><Icon kind="scale" />Détail des pesées</div>
            <div className="panel-body">
              <table className="pass-table">
                <thead><tr><th>N°</th><th>Poids brut</th><th>Sacs</th><th>Enregistré le</th></tr></thead>
                <tbody>
                  <tr><td>01</td><td>1 000 kg</td><td>10</td><td>10/09/2026 · 13:22</td></tr>
                  <tr><td>02</td><td>1 000 kg</td><td>10</td><td>10/09/2026 · 13:22</td></tr>
                </tbody>
              </table>
              <div className="pass-note"><span>Poids total enregistré</span><b>2 000 kg · 20 sacs</b></div>
            </div>
          </div>
        </section>

        <section className="settlement">
          <div className="settlement-title"><span><Icon kind="coin" />Récapitulatif de règlement</span><small>Montants en francs CFA (F)</small></div>
          <div className="settlement-grid">
            <div className="metric"><span className="metric-label">Poids brut</span><span className="metric-value">2 000 <small>kg</small></span></div>
            <div className="metric"><span className="metric-label">Nombre de sacs</span><span className="metric-value">20</span></div>
            <div className="metric"><span className="metric-label">Poids net</span><span className="metric-value">1 980 <small>kg</small></span></div>
            <div className="metric"><span className="metric-label">Prix unitaire</span><span className="metric-value">1 100 <small>F/kg</small></span></div>
            <div className="metric"><span className="metric-label">Valeur produit</span><span className="metric-value">2 178 000 <small>F</small></span></div>
            <div className="charges">
              <div className="charge"><span>Carburant</span><b>15 000 F</b></div>
              <div className="charge"><span>Autres charges</span><b>5 000 F</b></div>
              <div className="charge"><span>Frais de collecte</span><b>0 F</b></div>
              <div className="charge"><span>Avances retenues</span><b>0 F</b></div>
              <div className="charge total-deduct"><span>Total retenues</span><b>20 000 F</b></div>
            </div>
          </div>
        </section>

        <div className="pay-row">
          <div className="pay-copy"><span className="pay-check"><Icon kind="check" size={20} /></span><div><strong>Montant net à payer</strong><em>Deux millions cent cinquante-huit mille francs CFA</em></div></div>
          <div className="pay-total"><small>Net payable · CFA</small><b>2 158 000 F</b></div>
        </div>

        <section className="signatures" aria-label="Signatures des responsables">
          <div className="sign-box"><div className="sign-head"><Icon kind="person" size={15} />Peseur</div><div className="sign-body"><div className="sign-name">Nom et signature</div><div className="sign-line">Date &amp; signature</div></div></div>
          <div className="sign-box"><div className="sign-head"><Icon kind="truck" size={15} />Délégué livreur</div><div className="sign-body"><div className="sign-name">Siaka Koné</div><div className="sign-line">Date &amp; signature</div></div></div>
          <div className="sign-box"><div className="sign-head"><Icon kind="document" size={15} />Magasinier</div><div className="sign-body"><div className="sign-name">Nom et signature</div><div className="sign-line">Date &amp; signature</div></div></div>
        </section>

        <footer className="footer">
          <div className="footer-copy"><b>CoopDigital — Digitaliser pour mieux produire</b><br />Côte d’Ivoire &nbsp;·&nbsp; Document de démonstration<br />Vérifiez les informations auprès de votre coopérative.</div>
          <div className="verify"><div className="verify-text"><strong>Vérification du bordereau</strong>Réf. PE-5-2026-00037<br />Aperçu QR de démonstration</div><VerificationCode /></div>
        </footer>
        <div className="legal-note">Données fictives à des fins de démonstration · Campagne 2026–2027</div>
      </article>
    </main>
  );
}
