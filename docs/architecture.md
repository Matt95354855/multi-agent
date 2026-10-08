# Architecture et flux

## Intégration Harness

`HarnessAdapter` importe exclusivement les exports publics de `@matt95354855/agent-harness`. Il construit un `LLMClient` compatible `/v1/chat/completions`, expose aussi la création d'un `Agent`, et mesure chaque requête. Le sous-module contourne volontairement une limite actuelle du paquet amont : `dist/` n'est pas versionné et le paquet n'a pas de script `prepare`. `npm run bootstrap:harness` compile donc le commit exact avant la compilation de ce projet. Le typecheck joue le rôle de test de compatibilité de contrat.

## Séquence d'un run

1. La CLI vérifie l'approbation, le dépôt Git, crée une branche et un worktree.
2. Le Planner reçoit la demande, une carte bornée des fichiers et quelques fichiers prioritaires.
3. Son plan est validé. Les commandes de test doivent appartenir à la liste blanche.
4. Le Coder renvoie des contenus complets de fichiers. Le checkpoint enregistre la proposition avant l'écriture.
5. Les fichiers sont écrits atomiquement et leurs empreintes enregistrées.
6. Le Reviewer reçoit uniquement le besoin, le plan et le diff Git.
7. Après approbation, le Validator exécute les commandes sans shell. Un échec retourne vers `FIX`.
8. Trois corrections au maximum sont possibles. Chaque correction repasse par la revue puis les tests.
9. `FINALIZE` signifie que les validations demandées ont réussi ; cela ne crée ni commit, ni push, ni merge implicitement.

Une reprise depuis `IMPLEMENT` réapplique au besoin le `changeSet` checkpointé. L'écriture étant un remplacement atomique du même contenu, cette opération est idempotente. Les événements stockent des résumés structurés, pas l'historique complet des conversations.

## Allocation des rôles

`config/default.json` affecte GPT-OSS au Planner/Reviewer et Qwen au Coder. Modifier `roles` suffit pour comparer d'autres affectations. Lorsqu'un `ModelManager` est présent, tout appel de rôle déclenche une bascule contrôlée : l'ancien processus est arrêté avant le nouveau sauf autorisation explicite de concurrence.

## Budgets

Les limites portent sur durée totale, tokens de sortie, taille de contexte, fichiers, ensemble de changements, sortie de commande et nombre de corrections. Les délais utilisent des signaux d'annulation. Les métriques de tokens dépendent des compteurs renvoyés par llama.cpp ; une valeur zéro reste zéro au lieu d'être estimée.
