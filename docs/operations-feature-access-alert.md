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

## Contrat de livraison du collecteur

Le collecteur de production doit appliquer la règle suivante avant de
transmettre l'alerte au canal d'exploitation configuré :

```yaml
match:
  channel: operations-alerts
  event: feature_access_denied_spike
group_by:
  - cooperativeId
  - featureKey
  - mode
forward_fields:
  - channel
  - event
  - cooperativeId
  - featureKey
  - mode
  - denialCount
  - threshold
  - windowSeconds
```

Cette configuration est volontairement indépendante du fournisseur : le canal
de destination doit être choisi et configuré dans l'outil d'exploitation
(Slack, PagerDuty ou autre) sans ajouter de secret, d'identité ou de donnée
métier au payload. Tant qu'aucun outil n'est autorisé pour cet environnement,
l'API continue d'émettre l'événement JSON structuré mais ne tente pas d'appeler
un service externe.