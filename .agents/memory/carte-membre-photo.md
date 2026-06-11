---
name: Carte membre — photo base64 + QR pdfkit
description: Architecture de la carte de membre PDF — photo, QR code, statuts et upload portail
---

## Architecture

### Photo de profil (portail)
- Le membre prend une photo depuis `DocumentsPage.tsx` (input[type=file capture="user"])
- Client compresse via Canvas API → JPEG 400px, 0.78 quality → data URL base64
- `PUT /api/portail/photo { photoDataUrl }` → stocké dans `membres.photo_url` (text column)
- Taille typique : 30–80KB (data URL), limite serveur : 2.5MB
- `getProfilMembre()` retourne `photoUrl` et `carteStatut` dans la réponse profil

### Génération PDF (portailService.ts `generateCarteMembre`)
- Taille carte : 420 × 265 pt (paysage, format carte proche A6)
- QR code : `QRCode.toBuffer(codeMembre, { type: 'png', width: 140 })` → Buffer → `doc.image()`
- Photo : si `photo_url` commence par `data:image/` → parse base64 → Buffer; sinon `fetch(url)`
- Clip circulaire : `doc.save(); doc.circle(cx,cy,r).clip(); doc.image(buf,...); doc.restore()`
- Marque la carte `active` + `carte_genere_le` + `carte_numero` seulement si `carteStatut === 'non_emise'`
- Carte suspendue → lance une erreur (HTTP 403 côté controller)

### Colonnes DB ajoutées (migration 0012)
- `carte_statut` VARCHAR(20) DEFAULT 'non_emise' — 'non_emise' | 'active' | 'suspendue'
- `carte_numero` VARCHAR(50) — format `C-YYYY-XXXXXX`
- `carte_genere_le` TIMESTAMPTZ
- `carte_suspendue_le` TIMESTAMPTZ

### Admin cartes (membresController.ts)
- `GET /membres/cartes` — liste tous les membres avec champs carte (carteStatut, carteGenereLe…)
- `GET /membres/:id/carte-pdf` — génère le PDF admin (même fonction que portail)
- `PATCH /membres/:id/carte-statut` — body: `{ action: 'suspendre'|'activer', motif? }`

**Why:**
Stockage base64 en DB évite toute complexité d'object storage pour le MVP portail mobile.
Pour un usage production intensif, migrer vers presigned URL object storage + stocker l'objectPath.
