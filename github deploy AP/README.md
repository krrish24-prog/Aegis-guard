# Aegis Messenger

## Render deployment

1. Upload this folder to a private GitHub repository.
2. In Render, create a Blueprint from the repository.
3. Enter `NVIDIA_API_KEY` when Render requests it.
4. Deploy the service.

The included `render.yaml` builds the Vite frontend and Express server together.

Firebase Auth, Firestore, and Storage continue using the project configured in
`firebase-applet-config.json`.

## Local development

Copy `.env.example` to `.env.local`, add the NVIDIA key, then run:

```powershell
npm install
npm run dev
```
