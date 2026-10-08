# Modèle de sécurité

Les fichiers du dépôt cible, les sorties d'outils et les diffs sont des données non fiables. Les prompts de rôle le rappellent explicitement et les décisions d'exécution passent par des contrôles déterministes.

## Contrôles inclus

- résolution canonique du workspace et refus des sorties par `..`, chemins absolus ou liens vers l'extérieur ;
- tailles maximales avant lecture et écriture ;
- écriture atomique et activation conjointe par configuration et `--approve-write` ;
- commandes exactement listées, tokenisées sans shell, avec délai et sortie bornée ;
- exécution par défaut dans Docker sans réseau, sans capacités Linux, avec `no-new-privileges` et quotas mémoire/CPU/processus ;
- environnement enfant réduit à une petite liste de variables système, sans variables de secrets applicatifs ;
- endpoints HTTP validés par Harness, redirections refusées et réponses bornées ;
- traces expurgées pour les noms de champs sensibles et formats usuels de jetons ;
- push et création de PR séparés derrière `--approve-external` ; aucune commande de merge.

## Frontière importante

Docker apporte une frontière système réelle pour les commandes de validation, mais ne doit pas être considéré comme une frontière absolue contre un noyau compromis. Pour les dépôts les plus hostiles, exécuter Classcale Multi-Agent lui-même dans une VM jetable avec : réseau coupé ou filtré, montage du dépôt uniquement, utilisateur non privilégié, quotas CPU/RAM/processus, aucun socket Docker exposé, aucun credential Git/cloud et répertoire temporaire dédié. Le mode `host` est réservé aux dépôts explicitement fiables.

Ne mettez jamais de secrets dans la demande, le dépôt cible ou la configuration JSON. Injectez éventuellement le bearer token du serveur local via `LLM_API_KEY`, limité au processus courant.

## Approbations humaines

La création de branche/worktree et les écritures demandent `--approve-write`. Le commit peut être préparé via l'API `GitWorktreeManager.prepareCommit` seulement avec une approbation explicite. Le push et la PR demandent `--approve-external`. La fusion reste manuelle et hors périmètre.
