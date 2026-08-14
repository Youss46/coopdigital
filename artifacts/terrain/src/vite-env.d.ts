/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Clé publique Ed25519 embarquée au build Vite depuis SESSION_SECRET.
 * Utilisée par StationService pour vérifier les QR codes offline sans réseau.
 * Chaîne vide si SESSION_SECRET n'était pas disponible au moment du build.
 */
declare const __STATION_QR_PUBLIC_KEY__: string;
