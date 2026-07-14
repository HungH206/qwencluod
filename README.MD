BepFlowAI is a hackathon-focused multi-agent food decision dashboard.

The demo is intentionally narrow: help a user decide whether to eat at a restaurant, cook a recipe, or meal prep based on schedule, memory, cuisine preferences, budget, and available options.

## App Tabs

- Restaurants: shows available restaurant candidates and the Restaurant Agent's data source.
- Recipes: searches recipes through TheMealDB and falls back to curated demo recipes if the API is unavailable.
- Chat with Agents: lets the user prompt the orchestrator and watch each agent explain its evidence.

## Agent System

- Decision Orchestrator: coordinates all agents and produces the final recommendation.
- Memory Agent: persists preferences, dislikes, budget, and feedback in `localStorage`.
- Restaurant Agent: uses Google Places when configured, otherwise demo restaurants.
- Recipe Agent: uses TheMealDB for recipe search.
- Schedule Agent: infers urgency and time available from the prompt.
- Budget Agent: checks the weekly budget.
- Decision Agent: scores restaurant, cook, and meal prep options.

## API Integration

TheMealDB works directly from the frontend:

```ts
https://www.themealdb.com/api/json/v1/1/search.php?s=chicken
```

Google Places is wired behind a Vite environment variable:

```bash
cp .env.example .env
```

Then set:

```bash
VITE_GOOGLE_PLACES_API_KEY=your_key_here
```

For a production deployment, move Google Places calls behind a backend endpoint so the API key is not exposed in browser code.

Qwen chat runs through the local backend proxy in `server.mjs`, so `DASHSCOPE_API_KEY` stays out of browser code.

Set these in `.env`:

```bash
DASHSCOPE_API_KEY=your_dashscope_key_here
QWEN_MODEL=qwen3.5-flash
```

The chat endpoint is:

```text
POST /api/qwen-chat
```

The frontend sends the prompt plus current memory, restaurants, recipes, local decision scores, and agent evidence. Qwen acts as the Decision Orchestrator and returns:

```json
{
  "answer": "recommendation text",
  "agentNotes": ["Memory Agent: ...", "Restaurant Agent: ..."]
}
```

The orchestrator receives ranked candidates from both data agents:

- Restaurant Agent: Google Places candidates, scored by rating, travel time, source quality, and cuisine memory.
- Recipe Agent: TheMealDB candidates, scored by source quality, cuisine memory, and quick-cook fit.

Qwen is instructed to choose only from the provided restaurant and recipe candidates. If the requested city, cuisine, dish, or ingredient is missing from the current candidate data, it must say that clearly and recommend the closest available option instead of inventing one.

## Run Locally

```bash
npm install
npm run api
npm run dev
```

Run `npm run api` and `npm run dev` in separate terminals during local development.

## Hackathon Scope

This demo skips authentication, payments, delivery, social features, coupons, restaurant ownership, and native mobile. The priority is a clear multi-agent workflow judges can understand in under three minutes.

(STILL WORKING ON IT)