# Dépannage

## Le diagnostic signale un commit Harness différent

Exécuter `git submodule update --init --recursive`, puis `npm run bootstrap:harness`. Ne pointez pas le sous-module sur `main` : le commit exact protège contre les ruptures d'interface.

## Le port est occupé

Arrêter l'ancien `llama-server`, choisir un autre port et adapter l'endpoint. Pour réutiliser volontairement un serveur, passer le profil à `external`.

## Le modèle ne devient pas sain

Lire les journaux de llama.cpp directement, vérifier le chemin GGUF, la RAM disponible et les options supportées par cette version. Réduire `gpuLayers` et `contextSize`. Le gestionnaire arrête le processus après expiration du délai.

## JSON agent invalide

Réduire la température, augmenter modérément `maxOutputTokens` ou employer un modèle suivant mieux les schémas. Le système n'essaie jamais d'appliquer un résultat partiellement analysé.

## Une commande est refusée

Ajouter seulement la commande exacte nécessaire à `workspace.allowedCommands`. Les opérateurs de shell et commandes arbitraires sont volontairement refusés.

## Reprise impossible

Vérifier que le worktree enregistré dans `.runs/RUN_ID.json` existe toujours. Les checkpoints ne recréent pas un worktree supprimé afin d'éviter de rejouer aveuglément des effets de bord.
