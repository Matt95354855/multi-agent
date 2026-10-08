# Modèle de sécurité

Les fichiers du dépôt cible, les sorties d'outils et les diffs sont des données non fiables. Les prompts de rôle le rappellent explicitement et les décisions d'exécution passent par des contrôles déterministes.

## Contrôles inclus

- résolution canonique du workspace et refus des sorties par `..`, chemins absolus ou liens vers l'extérieur ;
- tailles maximales avant lecture et écriture ;
- écriture atomique et activation conjointe par configuration et `--approve-write` ;
- commandes exactement listées, tokenisées sans shell, avec délai et sortie bornée ;
- environnement enfant réduit à une petite liste de variables système, sans variables de secrets applicatifs ;
- endpoints HTTP validés par Harness, redirections refusées et réponses bornées ;
- traces expurgées pour les noms de champs sensibles et formats usuels de jetons ;
- push et création de PR séparés derrière `--approve-external` ; aucune commande de merge.

## Frontière importante

Ces contrôles ne constituent pas une isolation système. Un script de test autorisé peut exécuter le code arbitraire du dépôt avec les droits du processus. Pour des dépôts non fiables, exécuter Classcale Multi-Agent dans une VM jetable ou un conteneur avec : réseau coupé ou filtré, montage du dépôt uniquement, utilisateur non privilégié, quotas CPU/RAM/processus, aucun socket Docker, aucun credential Git/cloud et répertoire temporaire dédié.

Ne mettez jamais de secrets dans la demande, le dépôt cible ou la configuration JSON. Injectez éventuellement le bearer token du serveur local via `LLM_API_KEY`, limité au processus courant.

## Approbations humaines

La création de branche/worktree et les écritures demandent `--approve-write`. Le commit peut être préparé via l'API `GitWorktreeManager.prepareCommit` seulement avec une approbation explicite. Le push et la PR demandent `--approve-external`. La fusion reste manuelle et hors périmètre.
