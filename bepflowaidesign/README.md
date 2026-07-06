# FoodPilot AI

FoodPilot AI is a hackathon-focused multi-agent food decision dashboard.

The core demo answers one question:

> Should I cook, eat out, or meal prep tonight?

Instead of building a broad food platform, the app showcases an agent society:

- Decision Orchestrator: the only interface the user talks to.
- Memory Agent: persists preferences, dislikes, budget, and feedback in `localStorage`.
- Schedule Agent: infers urgency and available cooking time from the prompt.
- Restaurant Agent: compares nearby dining candidates.
- Recipe Agent: compares fast recipe options and marks the Qwen generation slot.
- Budget Agent: checks weekly remaining budget.
- Decision Agent: scores cook vs restaurant vs meal prep and explains the winner.

## Demo Features

- Live orchestrator input with scenario cycling.
- Agent dashboard showing each agent's evidence and confidence.
- Decision scoring for restaurant, cook, and meal prep.
- Persistent memory across browser sessions.
- Star feedback loop that updates memory and future recommendations.
- Demo architecture panel for judge walkthroughs.

## Run Locally

```bash
npm install
npm run dev
```

## Hackathon Scope

This is intentionally narrow for a five-day build. The demo avoids authentication, payments, delivery, social features, restaurant ownership tools, coupons, and mobile-native work.

Recommended production integrations after the demo:

- Qwen for generated recipes and richer agent reasoning.
- Google Places or Yelp for live restaurant search.
- Calendar API for real schedule signals.
- Weather API for delivery or walkability tradeoffs.
- Alibaba Cloud deployment with persistent storage replacing `localStorage`.
