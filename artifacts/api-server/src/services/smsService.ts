import { logger } from "../lib/logger";

interface SmsResult {
  telephone: string;
  succes: boolean;
  erreur?: string;
}

/**
 * Envoie un SMS via l'API Orange (Côte d'Ivoire).
 * Si ORANGE_SMS_API_KEY n'est pas configuré, simule l'envoi (mode démo).
 */
async function sendSmsOrange(telephone: string, message: string): Promise<boolean> {
  const apiKey = process.env["ORANGE_SMS_API_KEY"];
  const senderName = process.env["ORANGE_SMS_SENDER"] ?? "CoopDigital";

  if (!apiKey) {
    // Mode démo — pas d'API key configurée
    logger.info({ telephone, message: message.slice(0, 40) }, "SMS simulé (pas d'API key Orange)");
    return true;
  }

  // Normaliser le numéro CI (+225)
  const normalized = telephone.replace(/\s+/g, "").replace(/^0/, "+225");

  for (let tentative = 1; tentative <= 3; tentative++) {
    try {
      const res = await fetch("https://api.orange.com/smsmessaging/v1/outbound/tel%3A%2B225/requests", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          outboundSMSMessageRequest: {
            address: [`tel:${normalized}`],
            senderAddress: `tel:${senderName}`,
            outboundSMSTextMessage: { message },
          },
        }),
      });

      if (res.ok) return true;
      if (res.status >= 400 && res.status < 500) {
        // Erreur client, ne pas réessayer
        logger.warn({ telephone, status: res.status }, "Erreur SMS Orange client");
        return false;
      }
      // Erreur serveur → réessayer
      logger.warn({ telephone, tentative, status: res.status }, "Erreur SMS Orange serveur, retry");
    } catch (err) {
      logger.warn({ telephone, tentative, err }, "Exception SMS Orange, retry");
    }

    if (tentative < 3) await new Promise((r) => setTimeout(r, 1000 * tentative));
  }

  return false;
}

/**
 * Envoie un SMS à un seul destinataire.
 */
export async function sendSMS(telephone: string, message: string): Promise<SmsResult> {
  const succes = await sendSmsOrange(telephone, message);
  return { telephone, succes };
}

/**
 * Envoie un SMS groupé à une liste de numéros.
 * Limite : 50 envois en parallèle pour éviter de saturer l'API.
 */
export async function sendBulkSMS(
  telephones: string[],
  message: string
): Promise<{ envoyes: number; echecs: number; details: SmsResult[] }> {
  const results: SmsResult[] = [];
  const BATCH = 50;

  for (let i = 0; i < telephones.length; i += BATCH) {
    const batch = telephones.slice(i, i + BATCH);
    const batchResults = await Promise.all(
      batch.map((tel) => sendSmsOrange(tel, message).then((succes) => ({ telephone: tel, succes })))
    );
    results.push(...batchResults);
  }

  return {
    envoyes: results.filter((r) => r.succes).length,
    echecs: results.filter((r) => !r.succes).length,
    details: results,
  };
}

/**
 * Génère et envoie le reçu WhatsApp après une livraison.
 * Nécessite TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_WHATSAPP_FROM
 */
export async function sendRecuWhatsapp(params: {
  telephone: string;
  nom: string;
  poids: string;
  montantBrut: number;
  avanceDeduite: number;
  montantNet: number;
  reference: string;
}): Promise<boolean> {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  const from = process.env["TWILIO_WHATSAPP_FROM"] ?? "whatsapp:+14155238886";

  if (!accountSid || !authToken) {
    logger.info({ telephone: params.telephone }, "WhatsApp simulé (Twilio non configuré)");
    return false;
  }

  const message =
    `✅ Paiement reçu\n` +
    `Membre : ${params.nom}\n` +
    `Poids : ${params.poids} kg\n` +
    `Montant brut : ${params.montantBrut.toLocaleString("fr-FR")} FCFA\n` +
    `Avance déduite : ${params.avanceDeduite.toLocaleString("fr-FR")} FCFA\n` +
    `Net reçu : ${params.montantNet.toLocaleString("fr-FR")} FCFA\n` +
    `Réf : ${params.reference}`;

  const normalized = params.telephone.replace(/\s+/g, "").replace(/^0/, "+225");
  const to = `whatsapp:${normalized}`;

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({ From: from, To: to, Body: message });
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    return res.ok;
  } catch (err) {
    logger.warn({ telephone: params.telephone, err }, "Erreur WhatsApp Twilio");
    return false;
  }
}
