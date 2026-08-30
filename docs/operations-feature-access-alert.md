# Alerte exploitation — refus d'accès à une fonctionnalité

## Règle de déclenchement

L'API compte les refus par combinaison :

- `cooperativeId` : coopérative concernée ;
- `featureKey` : module concerné ;
- `mode` : `disabled` ou `lecture_seule`.

Une alerte est émise lorsque cette combinaison atteint **20 refus dans une
fenêtre glissante de 5 minutes**. Une seule alerte est émise au franchissement
du seuil pour chaque combinaison et chaque fenêtre. Le compteur est ensuite
réinitialisé à l'expiration de la fenêtre.

Ces valeurs sont définies par `FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD` et
`FEATURE_ACCESS_DENIAL_WINDOW_MS` dans
`artifacts/api-server/src/services/featureAccessMetrics.ts`.

## Routage dans le système de logs

Le serveur écrit l'événement en JSON avec :

```json
{
  "channel": "operations-alerts",
  "event": "feature_access_denied_spike"
}
```

La règle du collecteur de logs doit déclencher l'alerte sur cette combinaison
de champs :

```text
channel == "operations-alerts"
event == "feature_access_denied_spike"
```

Le regroupement de l'alerte se fait sur les champs
`cooperativeId`, `featureKey` et `mode`. Le `denialCount`, le `threshold` et
`windowSeconds` servent au diagnostic de l'alerte.

Le payload d'alerte ne contient que ces champs opérationnels :
`channel`, `event`, `cooperativeId`, `featureKey`, `mode`, `denialCount`,
`threshold` et `windowSeconds`. Il ne faut pas ajouter d'URL, d'identité
d'utilisateur, de token, de requête, de corps HTTP ou de donnée métier à cette
règle.