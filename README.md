# GitHub Deploy AP

Aegis Guard uses Firebase for authentication and Firestore, and Backblaze B2 for
media files (chat attachments, voice notes, and status media).

## Storage: Backblaze B2

B2 is S3-compatible, so the Express server talks to it with signed requests. The
bucket stays private and the B2 application key never reaches the browser.

### One-time B2 setup

1. In the Backblaze B2 console, create a **private** bucket (for example,
   `aegis-guard-media`). Note the region shown for the bucket, such as
   `us-west-004`.
2. Create an **application key** with **Read and Write** access, restricted to
   that bucket. Copy the key ID and application key.
3. Set these variables on the server (Render → Environment, or `.env.local` for
   local development):

   ```text
   B2_KEY_ID=...
   B2_APPLICATION_KEY=...
   B2_BUCKET_NAME=aegis-guard-media
   B2_REGION=us-west-004
   ```

   `B2_ENDPOINT` is optional. It defaults to
   `https://s3.<B2_REGION>.backblazeb2.com`.

4. Redeploy and check `GET /api/storage/status`. You should see
   `"preferred": "b2"`. The authenticated `POST /api/storage/write-test` also
   uploads and deletes a small probe object.

### How uploads work

- The browser encrypts chat attachments and voice notes before sending them to
  `POST /api/storage/upload`; the server stores the ciphertext in B2.
- Chat media keeps a stable same-origin URL (`/api/storage/b2/...`). The server
  authorizes the request with the Firebase token before streaming the object
  back, so old messages keep working.
- Status media is not encrypted (same as before). Because status images and
  videos are rendered by `<img>`/`<video>`, the upload response includes a
  seven-day presigned B2 URL. Statuses disappear after 24 hours, so this covers
  their lifetime.
- The bucket does not need public access or CORS rules for this flow. CORS is
  only needed if you later upload directly from the browser to B2.
- Chat media downloads are streamed through Express so the bucket can stay
  private and every request is checked against the Firebase token. On Render's
  free plan this traffic counts toward the 100 GB/month service bandwidth.
  Status media already loads directly from B2 and bypasses that limit.

### Limits and legacy files

Backblaze B2 includes 10 GB of free storage and free egress up to 3× your stored
data; beyond that it is billed at the current B2 rate. New uploads no longer use
Firebase Storage, which avoids the Firebase Storage quota.

Deleting a message or status removes its Firestore document, not the B2 object.
For status media, add a B2 lifecycle rule on the `status/` prefix (for example,
delete after 2 days) so expired uploads do not accumulate. Chat attachments stay
in `media/` because old messages may still need them.

Firebase Storage is still configured in `firebase.json` for **read-only legacy
media**. Do not delete the old Firebase Storage bucket (or the old Appwrite
bucket, if you used one) until those files have been migrated, or old messages
and statuses will lose their media. Old Appwrite file links continue to work
through the existing `/api/storage/files/...` download route when the
`APPWRITE_*` variables are present.

## Render deployment

1. Upload the `github deploy AP` folder to a private GitHub repository.
2. In Render, create a Blueprint from the repository.
3. Enter `NVIDIA_API_KEY`, `B2_KEY_ID`, and `B2_APPLICATION_KEY` when Render
   requests them. Set `B2_BUCKET_NAME` and `B2_REGION` in `render.yaml` to match
   your bucket.
4. Deploy the service.

The included `render.yaml` builds the Vite frontend and Express server together.
The frontend build is written to `dist`; the server bundle is written separately
to `dist-server` so server code is not exposed as a static file.

Firebase Auth and Firestore continue using the project configured in
`firebase-applet-config.json`.

## Local development

Copy `.env.example` to `.env.local`, add the NVIDIA key and B2 credentials, then
run:

```powershell
npm install
npm run dev
```

You can find whether media storage is ready at
`http://localhost:3000/api/storage/status`. The endpoint is public and only
reports configuration/health, never credentials.
