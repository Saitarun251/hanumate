# Hanumate GitHub App

AI coding assistant GitHub App for autonomous coding agents.

## Features

- AI-powered code review and assistance
- Automatic issue and PR handling
- Branch-based task automation
- Multi-repo support with per-repo configuration
- GitHub Actions integration

## Prerequisites

- Node.js >= 18.0.0
- A GitHub App registered on GitHub

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

4. Build the app:
   ```bash
   npm run build
   ```

## Configuration

### GitHub App Setup

1. Go to GitHub Settings > Developer settings > GitHub Apps
2. Click "New GitHub App"
3. Fill in the details:
   - **GitHub App name**: Hanumate (or your preferred name)
   - **Homepage URL**: https://hanumate.dev
   - **Webhook URL**: Your server URL (e.g., https://your-app.vercel.app)
   - **Webhook secret**: Generate a secure random string

4. Set permissions:
   - Repository: checks (write), contents (read), issues (write), metadata (read), pull_requests (write), statuses (write)
   - Organization: members (read)

5. Subscribe to events:
   - Check run, check suite, issue comment, issues, label, pull request, pull request review, pull request review comment, push, workflow run

6. Create and download the private key from the app settings

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| GITHUB_APP_ID | Yes | Your GitHub App ID |
| GITHUB_PRIVATE_KEY | Yes | Private key content or path |
| WEBHOOK_SECRET | Yes | Webhook secret for signature verification |
| HANUMATE_API_URL | No | Hanumate API URL (default: http://localhost:3000) |
| HANUMATE_API_KEY | No | API key for Hanumate |
| TASK_TIMEOUT | No | Task timeout in ms (default: 300000) |
| PORT | No | Server port (default: 3000) |

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

## Deployment

### Vercel

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Set environment variables in Vercel dashboard

### AWS Lambda

1. Build the project
2. Package for Lambda:
   ```bash
   npm run build
   zip -r function.zip dist/
   ```

3. Upload to Lambda and configure:
   - Runtime: Node.js 18.x
   - Handler: dist/index.handler

### Docker

```bash
# Build image
docker build -t hanumate-github-app .

# Run container
docker run -p 3000:3000 --env-file .env hanumate-github-app
```

## Registering the App

You can use the manifest.json to quickly create the GitHub App:

1. Go to: `https://github.com/apps/YOUR_APP_NAME/installations/new`
2. Or use GitHub CLI:
   ```bash
   gh api graphql -f query='
     mutation {
       createAppManifest(input: {
name: "Hanumate",
          url: "https://hanumate.dev"
       }) {
         manifest
         code
         verificationUrl
         }
       }'
   ```

## Usage

1. Install the app on your repositories
2. Mention @hanumate in issues or PRs
3. Add labels to trigger automated workflows
4. The app will respond with AI-powered assistance

## License

MIT