export const CERTIFICATIONS_CACAO = ["RA", "FAIRTRADE", "ASR_1000", "ORDINAIRE"] as const;
export type CertificationCacao = (typeof CERTIFICATIONS_CACAO)[number];

export function isCertificationCacao(value: unknown): value is CertificationCacao {
  return typeof value === "string"
    && (CERTIFICATIONS_CACAO as readonly string[]).includes(value);
}