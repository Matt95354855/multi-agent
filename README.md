# Classcale Multi-Agent

Plateforme locale et bornée de développement logiciel multi-agent, conçue pour faire coopérer GPT-OSS 20B et Qwen 3.6 27B avec le [Harness Classcale](https://github.com/Matt95354855/Harness). Elle planifie une modification, travaille dans un Git worktree isolé, applique des contenus de fichiers validés, effectue une revue indépendante, lance des commandes autorisées, corrige au plus trois fois, puis laisse une branche vérifiable à un humain.

> État matériel : la logique hors ligne et les modèles simulés sont testés en CI. Aucune performance GPU réelle n'est incluse dans le dépôt. Les rapports marquent explicitement les campagnes simulées et ne produisent des mesures matérielles que lorsqu'elles sont réellement observées.

## Garanties principales

- TypeScript strict, Node.js 22.13 ou supérieur.
- Harness épinglé comme sous-module au commit `70388c956cbed66927bfc8c54e539b20b898fed5`; aucun changement n'est apporté à Harness.
- Machine à états explicite : `PLAN → IMPLEMENT → REVIEW → TEST → FIX → FINALIZE`.
- Sorties Planner, Coder et Reviewer validées par Zod ; aucune transition ne dépend d'un simple texte libre.
- Un seul modèle géré actif par défaut, arrêt contrôlé avant bascule, détection de port, contrôle de santé et seuils RAM/VRAM.
- Écritures désactivées sans `--approve-write`; commandes exactes en liste blanche, lancées sans shell dans un conteneur Docker verrouillé par défaut.
- Chemins bornés au workspace, contrôle des liens symboliques, limites de taille, délais, environnement nettoyé et traces expurgées.
- Checkpoints JSON atomiques et idempotence des changements par empreinte SHA-256.
- Aucune fusion automatique. La publication exige `--approve-external` et ouvre seulement une PR.

## Installation

```bash
git clone --recurse-submodules https://github.com/Matt95354855/multi-agent.git
cd multi-agent
npm ci
npm run bootstrap:harness
npm run check
```

Copier `.env.example` vers `.env` sans jamais le versionner, puis adapter `config/default.json`. Node ne charge pas automatiquement `.env` : définissez les variables dans votre terminal ou utilisez le mécanisme de votre choix avant le lancement.

## Utilisation

Diagnostic sans modèle :

```bash
npm run doctor
```

Exécuter une tâche dans un worktree et une branche isolés :

```bash
npm run dev -- run --repo C:\projets\mon-app --request "Corrige le bug et ajoute les tests" --approve-write --branch classcale/fix-bug
```

Reprendre après interruption :

```bash
npm run dev -- resume --run-id 00000000-0000-0000-0000-000000000000 --approve-write
```

Publier la branche et ouvrir une PR, sans la fusionner :

```bash
npm run dev -- publish --workspace C:\projets\.classcale-worktrees\mon-app\RUN_ID --branch classcale/fix-bug --title "fix: correction validée" --approve-external
```

## Modèles

Les profils `managed` lancent `llama-server` avec `--fit on`, `--parallel 1`, un contexte borné et un nombre prudent de couches GPU. `LLAMA_SERVER_PATH` peut remplacer l'exécutable. Les chemins GGUF viennent de `GPT_OSS_MODEL_PATH` et `QWEN_MODEL_PATH`. Le gestionnaire mesure le temps de chargement et interroge `nvidia-smi` lorsqu'il existe ; l'absence de GPU NVIDIA reste un état valide et n'est pas inventée.

Pour des serveurs déjà lancés, partez de `config/external-servers.example.json` et fusionnez les profils `kind: "external"` dans une configuration complète. Dans ce mode, aucun processus n'est créé.

## Benchmark

Le corpus déterministe contient 50 tâches réparties entre bugs, refactoring, tests, fonctionnalités, modifications multi-fichiers, erreurs et sécurité. Les assertions cachées ne sont pas injectées dans le contexte agent. Chaque stratégie repart d'un dépôt Git frais.

```bash
npm run dev -- benchmark --strategies gpt-oss,qwen,collaboration --limit 50 --output benchmark-results/local.json
```

Le JSON contient succès réel, régressions, tentatives, durée, tokens rapportés par le serveur, bascules, chargements et instantanés RAM/VRAM. `simulated: true` distingue toute exécution avec modèles injectés. Voir [docs/benchmarks.md](docs/benchmarks.md).

## Architecture

| Zone | Responsabilité |
|---|---|
| `src/harness` | Adaptation des exports publics `Agent`, `LLMClient` et `LanguageModel` |
| `src/models` | Cycle de vie llama.cpp, ressources et métriques |
| `src/agents` | Affectation configurable des rôles et validation JSON |
| `src/orchestrator` | États, budgets, correction et reprise |
| `src/workspace` | Worktrees, fichiers bornés, diff et validations |
| `src/security` | Chemins, commandes et redaction |
| `src/memory` | Checkpoints atomiques |
| `src/evaluation` | Corpus de 50 tâches et rapports comparatifs |

La conception détaillée est dans [docs/architecture.md](docs/architecture.md), le modèle de sécurité dans [docs/security.md](docs/security.md), et le guide Windows dans [docs/windows.md](docs/windows.md).

Docker doit être disponible pour les validations avec la configuration par défaut. Pour un dépôt entièrement fiable seulement, `workspace.sandbox` peut être remplacé par `{ "mode": "host" }`.

## Limites connues

- Le garde-fou Node.js n'est pas un sandbox système. Exécutez les tâches non fiables dans une VM ou un conteneur verrouillé ; voir la documentation sécurité.
- La création automatique de PR dépend de GitHub CLI déjà authentifié.
- Les paramètres GPU fournis sont des points de départ conservateurs, pas des optimums universels.
- Les modèles peuvent produire un JSON invalide ; l'étape échoue alors explicitement au lieu d'appliquer une sortie ambiguë.
- Une campagne complète de 150 exécutions (50 × 3 stratégies) est coûteuse en temps. Commencez par `--limit 1`.

## Développement

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Les dépendances sont verrouillées par `package-lock.json`. La CI initialise le sous-module, compile Harness puis exécute la chaîne complète.
