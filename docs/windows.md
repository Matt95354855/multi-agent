# Démarrage Windows

## Prérequis

- Windows 11, Git et GitHub CLI ;
- Node.js 22.13 ou supérieur ;
- une version récente de `llama-server.exe` compatible avec vos GGUF ;
- Docker Desktop pour l'isolation par défaut des commandes de validation ;
- pilotes GPU à jour. `nvidia-smi` est utilisé s'il est disponible.

Dans PowerShell :

```powershell
git clone --recurse-submodules https://github.com/Matt95354855/multi-agent.git
Set-Location multi-agent
npm ci
npm run bootstrap:harness
npm run check
Copy-Item .env.example .env
```

Définir les variables pour la session :

```powershell
$env:LLAMA_SERVER_PATH = 'C:\llama.cpp\llama-server.exe'
$env:GPT_OSS_MODEL_PATH = 'D:\models\gpt-oss-20b-mxfp4.gguf'
$env:QWEN_MODEL_PATH = 'D:\models\qwen-3.6-27b-instruct-q4_k_m.gguf'
npm run doctor
```

Commencer avec les contextes 4096/2048 et les couches GPU du profil. Surveiller la VRAM avec `nvidia-smi -l 1` et la RAM dans le Gestionnaire des tâches. En cas d'échec de chargement, réduire `gpuLayers`, puis le contexte. Augmenter une seule variable à la fois et conserver les rapports JSON. Ne déduisez pas le débit d'un autre GPU.

Pour un serveur existant, utilisez `kind: "external"` et son URL `/v1`. Vérifiez d'abord :

```powershell
Invoke-RestMethod http://127.0.0.1:8080/v1/models
```

Les premières validations recommandées sont `benchmark --limit 1`, puis 5, avant les 50 tâches et trois stratégies.
