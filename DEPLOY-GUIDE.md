# Deployment Guide: tonal.kpifit.com

## Prerequisites

- GitHub account (to host the fork)
- Vercel account (free tier works)
- Convex account (convex.dev — free tier works)
- Access to DNS settings for kpifit.com

## Step 1: Push to Your GitHub Fork

```bash
cd tonal-coach
git init
git add -A
git commit -m "feat: multi-client coach dashboard with profile switching"
git remote add origin https://github.com/YOUR_USERNAME/tonal-coach.git
git push -u origin main
```

## Step 2: Set Up Convex Backend

```bash
npm install
npx convex dev
```

This will:

1. Prompt you to create a Convex account (if needed)
2. Create a new Convex project
3. Deploy your schema and functions
4. Generate the API types (fixes any remaining TypeScript errors)

Save the deployment URL — you'll need it for Vercel env vars.

## Step 3: Environment Variables

Create a `.env.local` for local development:

```env
# Convex
CONVEX_DEPLOYMENT=your-deployment-name
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Token encryption (generate a 64-char hex string)
TOKEN_ENCRYPTION_KEY=your-64-char-hex-key

# Auth (from Convex Auth setup)
AUTH_SECRET=your-auth-secret

# Optional: Sentry, PostHog, Discord webhook
```

Generate a TOKEN_ENCRYPTION_KEY:

```bash
openssl rand -hex 32
```

## Step 4: Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repo
3. Set the following environment variables:
   - `CONVEX_DEPLOY_KEY` — from Convex dashboard → Settings → Deploy keys
   - `NEXT_PUBLIC_CONVEX_URL` — your Convex deployment URL
   - `TOKEN_ENCRYPTION_KEY` — same as local
   - `AUTH_SECRET` — same as local
   - Any other env vars from `.env.local`

4. The `vercel.json` already has the correct build command:

   ```json
   { "buildCommand": "npx convex deploy --cmd 'npm run build'" }
   ```

5. Deploy!

## Step 5: Configure tonal.kpifit.com Subdomain

### In Vercel:

1. Go to your project → Settings → Domains
2. Add `tonal.kpifit.com`

### In your DNS provider (for kpifit.com):

Add a CNAME record:

```
Type:  CNAME
Name:  tonal
Value: cname.vercel-dns.com
TTL:   300 (or Auto)
```

Wait for DNS propagation (usually 1-5 minutes, up to 48 hours).

### Verify:

Vercel will automatically provision an SSL certificate. Once DNS propagates,
`https://tonal.kpifit.com` will serve your app.

## Step 6: Verify Everything Works

1. Visit `https://tonal.kpifit.com`
2. Sign up / log in
3. Connect your Tonal account
4. Complete onboarding
5. Go to the Coach page in the sidebar
6. Add a second client via the Client Switcher dropdown
7. Connect the second client's Tonal account
8. Switch between clients and verify data isolation

## What Changed (Summary of New Code)

### New Files

- `convex/coachDashboard.ts` — aggregated coach overview query
- `src/hooks/useActiveClient.ts` — React hook for active profile management
- `src/components/ClientSwitcher.tsx` — dropdown switcher in the sidebar
- `src/app/(app)/coach/page.tsx` — Coach Dashboard page
- `src/app/(app)/coach/ClientCard.tsx` — per-client card component

### Modified Files

- `convex/schema.ts` — added `activeClientProfileId` to users, `clientLabel` and `isCoachAccount` to userProfiles
- `convex/userProfiles.ts` — added multi-client mutations (setActiveProfile, getActiveProfile, listMyProfiles, addClientProfile, removeClientProfile)
- `convex/users.ts` — getMe now uses the active profile
- `convex/tonal/connect.ts` — supports patching an existing profile stub (profileId param)
- `convex/tonal/connectPublic.ts` — passes profileId through
- `src/app/connect-tonal/page.tsx` — reads profileId from URL query params
- `src/components/AppShell.tsx` — added ClientSwitcher and Coach nav link
