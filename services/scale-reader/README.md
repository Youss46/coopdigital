# CoopDigital — Lecteur Balance Yaohua A12E

Service local Node.js qui lit la balance industrielle via RS232 et expose le poids
en temps réel au navigateur du peseur via WebSocket.

## Architecture

```
Balance Yaohua A12E
   │ RS232 (COM1 / /dev/ttyS0)
   ▼
[scale-reader service]  ← tourne sur le PC du peseur
   │ WebSocket ws://localhost:4001   ← frontend React s'y connecte
   │ HTTP     http://localhost:4002/api/scale/current-weight  (fallback)
   ▼
Navigateur du peseur (hébergé sur Vercel)
```

> **Pourquoi en local ?** L'accès au port série physique est impossible depuis
> un serveur cloud (Railway/Vercel). Ce service tourne uniquement sur la machine
> physiquement branchée à la balance.

## Prérequis

- Node.js ≥ 18
- `npm install` dans ce répertoire
- (Optionnel pour fond de tâche) `npm install -g pm2`

## Configuration

Copier `.env.example` → `.env` et adapter :

| Variable     | Défaut        | Description                                      |
|-------------|---------------|--------------------------------------------------|
| `SCALE_PORT` | `COM1`        | Port série (Windows : `COM1`…, Linux : `/dev/ttyS0`) |
| `WS_PORT`    | `4001`        | Port WebSocket vers le navigateur                 |
| `HTTP_PORT`  | `4002`        | Port HTTP de fallback                             |
| `LOG_LEVEL`  | `info`        | `debug` pour voir chaque trame brute              |

## Lancement

### Mode développement (rechargement auto)
```bash
npm run dev
```

### Mode production (simple)
```bash
npm run build
npm start
```

### Mode fond de tâche avec pm2 (recommandé en déploiement terrain)
```bash
npm run build
npm run pm2:start

# Voir les logs en direct
npm run pm2:logs

# Arrêter
npm run pm2:stop
```

Pour que pm2 redémarre automatiquement au boot :
```bash
pm2 startup        # suivre les instructions affichées
pm2 save
```

## Permissions Linux (si /dev/ttyS0)

Sur Linux, l'utilisateur doit être dans le groupe `dialout` :
```bash
sudo usermod -aG dialout $USER
# puis se déconnecter/reconnecter
```

## Format des trames (Yaohua A12E)

La balance envoie des trames en continu (1-2 Hz) de la forme :
```
wn000005 kg\r\n
```

Le service utilise une regex tolérante (`/(\d{1,8}(?:[.,]\d{1,4})?)\s*kg/i`) pour
capturer le poids, quel que soit le préfixe variable de l'indicateur.

**Stabilité** : le poids n'est considéré "stable" qu'après 3 lectures consécutives
dans une fenêtre de ±0.5 kg.

## Payload WebSocket

Le service pousse un JSON à chaque changement d'état :

```json
{
  "weightKg": 247.5,
  "isStable": true,
  "isConnected": true,
  "updatedAt": "2026-08-15T14:30:00.000Z",
  "error": null
}
```

En cas de déconnexion :
```json
{
  "weightKg": null,
  "isStable": false,
  "isConnected": false,
  "updatedAt": "...",
  "error": "Balance non connectée : Port fermé"
}
```
