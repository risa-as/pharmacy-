# AI chat deployment — 2026-09-30

- Production: https://app.faramace.com
- Project: `pharmacy-web`
- Release branch: `codex/ai-purchasing-deploy-20260930`
- Source: `466853db947119ae13bcb2ece4cef0e40863608c` (implementation `35d1bab`, followed by a trailing-whitespace cleanup).
- Deployment: `dpl_FWNSRnp6mAGUWeJzqSVxemwWGVr7`
- Vercel deployment state: READY, source SHA confirmed, promotion successful.
- `app.faramace.com` alias points to the above deployment.
- Production smoke checks: `/login` 200; unauthenticated `/api/ai/status`, `/api/ai/usage`, and POST `/api/ai/chat` each 401.
- Previous production deployment: `dpl_HZcY4opTwKEFwbbXqYRHTCRwKWpm` (source `5a5af83`).
- No schema migrations, landing-page promotion, or customer purchase orders were performed.

Evidence: [review](ai-chat-review-2026-09-30.md). Final production build, 1,281 unit tests and 377 integration tests passed. UI checks used a local production build and synthetic records; a second browser test exercised the actual local purchase endpoint with ten-day coverage. The provider test used actual Gemini calls on eight synthetic sales questions. All 50 advertised questions were checked for routing and database context; the other 42 generated answers were not individually validated with a real model.

Local test servers and both PostgreSQL clusters started/restarted for verification were stopped after confirming there were no other connected clients. Session-cookie configuration was removed. Isolated release checkout is clean. Main checkout retains its pre-existing work and copies of this task's changes.
