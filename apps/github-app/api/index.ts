# Vercel Serverless Function for RubberDuck GitHub App
# Deploy this as a Vercel serverless function

import type { VercelRequest, VercelResponse } from '@vercel/node';

// Re-export the Probot app as serverless handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // For Vercel serverless, we need to handle webhook requests
  // The actual app logic is in dist/index.js

  // This is a placeholder - the actual deployment would use
  // probot/adapter-aws-lambda or similar for serverless

  if (req.method === 'GET' && req.url === '/health') {
    res.status(200).json({ status: 'ok' });
    return;
  }

  res.status(200).json({ message: 'RubberDuck GitHub App endpoint' });
}

export const config = {
  api: {
    bodyParser: false, // Let Probot handle raw body
  },
};