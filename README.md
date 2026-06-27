# GitHub Deploy AP

## Render deployment

1. Upload the `github deploy AP` folder to a private GitHub repository.
2. In Render, create a Blueprint from the repository.
3. Enter `NVIDIA_API_KEY` when Render requests it.
4. Deploy the service.

The included `render.yaml` builds the Vite frontend and Express server together.
The frontend build is written to `dist`; the server bundle is written separately
to `dist-server` so server code is not exposed as a static file.

Firebase Auth, Firestore, and Storage continue using the project configured in
`firebase-applet-config.json`.

## Local development

Copy `.env.example` to `.env.local`, add the NVIDIA key, then run:

```powershell
npm install
npm run dev
```
