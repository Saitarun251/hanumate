# Hanumate GitHub App Deployment Guide

This guide walks you through deploying the Hanumate GitHub App to test it on your repositories.

---

## Step 1: Register a GitHub App

1. Go to **GitHub Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**

2. Fill in the required fields:
   - **GitHub App name**: `Hanumate-Test` (or any name you prefer)
   - **Homepage URL**: `https://hanumate.dev`
   - **Webhook URL**: `https://your-app-url.com/webhooks/github` (we'll update this later)
   - **Webhook secret**: Generate a random string (save this!)

3. Set **Permissions** (under Permissions section):
   | Permission | Access |
   |------------|--------|
   | Checks | Read & write |
   | Contents | Read |
   | Issues | Read & write |
   | Metadata | Read |
   | Pull requests | Read & write |
   | Repository hooks | Read & write |
   | Statuses | Read & write |
   | Members | Read |
   | Organization hooks | Read |

4. Subscribe to **Events**:
   - [x] Check run
   - [x] Check suite
   - [x] Issue comment
   - [x] Issues
   - [x] Label
   - [x] Pull request
   - [x] Pull request review
   - [x] Pull request review comment
   - [x] Push
   - [x] Workflow run

5. Click **Create GitHub App**

6. **Download the private key** (you'll need this for deployment)

7. Note your **App ID** (shown on the app settings page)

---

## Step 2: Choose Deployment Method

### Option A: Local Development (Quick Test)

1. Clone and build:
   ```bash
   cd hanumate/apps/github-app
   npm install
   npm run build
   ```

2. Create `.env` file:
   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your values:
   ```
   GITHUB_APP_ID=your_app_id
   GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
   WEBHOOK_SECRET=your_webhook_secret
   ```

4. Start the app:
   ```bash
   npm run dev
   ```

5. Use ngrok to expose locally:
   ```bash
   ngrok http 3000
   ```

6. Update your GitHub App's webhook URL to the ngrok URL

### Option B: Vercel Deployment

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   cd hanumate/apps/github-app
   vercel
   ```

3. Set environment variables in Vercel dashboard:
   - `GITHUB_APP_ID`
   - `GITHUB_PRIVATE_KEY`
   - `WEBHOOK_SECRET`

4. Update your GitHub App's webhook URL to your Vercel URL

### Option C: Docker Deployment

1. Build the image:
   ```bash
   docker build -t hanumate-github-app hanumate/apps/github-app
   ```

2. Run with environment variables:
   ```bash
   docker run -p 3000:3000 \
     -e GITHUB_APP_ID=your_app_id \
     -e GITHUB_PRIVATE_KEY="$(cat your-key.pem)" \
     -e WEBHOOK_SECRET=your_secret \
     hanumate-github-app
   ```

---

## Step 3: Install the App

1. Go to your GitHub App settings page
2. Click **Install App** 
3. Select which repositories to install it on (or all repositories)
4. Grant the necessary permissions

---

## Step 4: Test the App

Create a test repository and try these interactions:

### Test 1: Issue Comment
1. Open an issue in the test repo
2. Comment: `@hanumate help me with this`
3. The app should respond

### Test 2: PR Review
1. Create a pull request
2. Add label `hanumate-dispatch`
3. The app should trigger a review

### Test 3: Auto Reply
1. Open an issue
2. The app should automatically respond

---

## Troubleshooting

### Webhook not received?
- Check the webhook URL is accessible
- Verify the webhook secret matches
- Check GitHub's webhook delivery logs

### App not responding?
- Check the app logs for errors
- Verify the private key is correct
- Ensure the app is installed on the repository

### Environment variables not loading?
- Restart the server after changing `.env`
- Verify the variable names match exactly

---

## Files Created for Deployment

| File | Purpose |
|------|---------|
| `Dockerfile` | Docker container deployment |
| `api/index.ts` | Vercel serverless function |
| `.env.example` | Environment variable template |
| `README.md` | General documentation |
| `DEPLOY.md` | This deployment guide |