# Protocole d'évaluation

Le corpus expose la demande et les tests publics dans un dépôt temporaire. L'assertion d'acceptation cachée reste dans le runner, hors du workspace présenté aux agents. Chaque couple tâche/stratégie repart du même état Git, ce qui évite qu'une stratégie hérite des changements d'une autre.

Les trois stratégies sont : GPT-OSS pour tous les rôles, Qwen pour tous les rôles, et l'affectation collaborative configurée. Le rapport distingue succès du workflow, acceptation cachée et régression des tests publics. Il enregistre tentatives, temps, tokens, bascules, temps de chargement ainsi que les instantanés matériels disponibles.

`simulated` vaut `true` dès que des `LanguageModel` sont injectés. Une campagne locale réelle doit conserver ce champ à `false`. L'absence de `gpu` signifie que la télémétrie GPU n'était pas disponible ; elle ne doit pas être remplacée par une estimation.

Pour une comparaison rigoureuse : fermer les applications GPU concurrentes, conserver les mêmes versions GGUF/llama.cpp/configurations, alterner l'ordre des stratégies entre répétitions, exécuter plusieurs répétitions, publier les rapports bruts et rapporter intervalles de confiance en plus des moyennes.
