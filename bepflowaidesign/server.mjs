import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mealPlannerTools, runMealPlannerTool } from "./meal-planner-tools.mjs";

const PORT = Number(process.env.FC_CUSTOM_LISTEN_PORT || process.env.PORT || process.env.API_PORT || 8787);
const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "https://qwencluod.vercel.app",
  ...(process.env.FRONTEND_ORIGINS || process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
]);
const DASH_SCOPE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";
const spoonacularCache = new Map();
const SPOONACULAR_CACHE_MS = 30 * 60 * 1000;

loadEnv();

function loadEnv() {
  const envPath = join(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });
  res.end(JSON.stringify(payload));
}

function stripHtml(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

async function searchSpoonacularRecipes(query) {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) return { configured: false, recipes: [] };
  const cacheKey = query.trim().toLowerCase();
  const cached = spoonacularCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < SPOONACULAR_CACHE_MS) {
    return { ...cached.payload, cached: true };
  }

  const url = new URL("https://api.spoonacular.com/recipes/complexSearch");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("number", "18");
  url.searchParams.set("addRecipeInformation", "true");
  url.searchParams.set("fillIngredients", "true");

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    const message = data?.message || "Spoonacular request failed";
    if (response.status === 402 || response.status === 429 || /points limit|quota/i.test(message)) {
      const quotaPayload = { configured: true, recipes: [], warning: message };
      spoonacularCache.set(cacheKey, { savedAt: Date.now(), payload: quotaPayload });
      return quotaPayload;
    }
    throw new Error(data?.message || "Spoonacular request failed");
  }

  const payload = {
    configured: true,
    recipes: (data.results ?? []).map((recipe) => {
      const analyzedSteps = recipe.analyzedInstructions?.[0]?.steps?.map((step) => step.step).filter(Boolean) ?? [];
      return {
        id: `spoonacular-${recipe.id}`,
        name: recipe.title,
        cuisine: recipe.cuisines?.[0] || "Global",
        time: recipe.readyInMinutes ? `${recipe.readyInMinutes} min` : "Time unavailable",
        source: "Spoonacular",
        image: recipe.image || "",
        ingredients: (recipe.extendedIngredients ?? []).map((ingredient) => ingredient.original).filter(Boolean),
        instructions: analyzedSteps.length ? analyzedSteps.join("\n") : stripHtml(recipe.instructions || recipe.summary || "Recipe instructions unavailable."),
        sourceUrl: recipe.sourceUrl || recipe.spoonacularSourceUrl || "",
      };
    }),
  };
  spoonacularCache.set(cacheKey, { savedAt: Date.now(), payload });
  return payload;
}

function placePrice(level) {
  return ({ PRICE_LEVEL_FREE: "Free", PRICE_LEVEL_INEXPENSIVE: "$", PRICE_LEVEL_MODERATE: "$$", PRICE_LEVEL_EXPENSIVE: "$$$", PRICE_LEVEL_VERY_EXPENSIVE: "$$$$" })[level] || "$$";
}

function distanceMiles(from, to) {
  if (!from || !to) return null;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latDelta = radians(to.latitude - from.latitude);
  const lngDelta = radians(to.longitude - from.longitude);
  const value = Math.sin(latDelta / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(lngDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function searchGooglePlaces(query, latitude, longitude) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return { configured: false, places: [], warning: "GOOGLE_PLACES_API_KEY is not configured on the backend." };
  const hasLocation = Number.isFinite(latitude) && Number.isFinite(longitude);
  const wantsCafe = /cafe|coffee/i.test(query);
  const nearby = wantsCafe && hasLocation;
  const endpoint = nearby ? "https://places.googleapis.com/v1/places:searchNearby" : "https://places.googleapis.com/v1/places:searchText";
  const body = nearby
    ? { includedTypes: ["cafe"], maxResultCount: 10, rankPreference: "DISTANCE", locationRestriction: { circle: { center: { latitude, longitude }, radius: 5000 } } }
    : { textQuery: hasLocation ? query : `${query} near San Francisco`, maxResultCount: 10, ...(hasLocation ? { locationBias: { circle: { center: { latitude, longitude }, radius: 5000 } } } : {}) };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.types,places.location",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || "Google Places request failed");
  const origin = hasLocation ? { latitude, longitude } : null;
  return {
    configured: true,
    places: (data.places ?? []).map((place, index) => {
      const miles = distanceMiles(origin, place.location);
      return {
        id: place.id,
        name: place.displayName?.text || "Place",
        cuisine: wantsCafe ? "Cafe" : query.replace(/\s+restaurants?$/i, "") || "Restaurant",
        rating: place.rating || 4.3,
        price: placePrice(place.priceLevel),
        distance: miles == null ? `${(0.7 + index * 0.4).toFixed(1)} mi` : `${miles.toFixed(1)} mi`,
        minutes: miles == null ? 8 + index * 3 : Math.max(2, Math.round(miles * 4)),
        source: "Google Places",
        address: place.formattedAddress || "Address unavailable",
      };
    }),
  };
}

function localDevelopmentResponse(body) {
  const decision = body.decision;
  const topRestaurant = body.restaurants?.[0];
  const topRecipe = body.recipes?.[0];
  return {
    source: "local-dev",
    answer:
      `Qwen backend is not configured yet. Demo decision: ${decision?.title ?? "review the current options"}. ` +
      `${decision?.explanation ?? "The local agents have already scored restaurants, recipes, budget, and schedule."} ` +
      `Top restaurant candidate: ${topRestaurant?.name ?? "not available"}. Top recipe candidate: ${topRecipe?.name ?? "not available"}.`,
    agentNotes: [
      "Memory: loaded local preferences and budget.",
      "Restaurant: ranked visible Google Places or demo restaurant candidates.",
      "Recipe: ranked TheMealDB or demo recipe candidates.",
      "Inventory: checked pantry items against recipe ingredients.",
      `Meal Planner: ${body.mealPlan?.length ? `loaded ${body.mealPlan.length} planned meals.` : "no saved meal plan yet."}`,
      "Budget: checked remaining weekly spend.",
      "Decision: produced a deterministic recommendation while waiting for DASHSCOPE_API_KEY.",
    ],
  };
}

function buildQwenMessages(body) {
  const context = {
    userPrompt: body.prompt,
    userContext: body.userContext,
    location: body.location,
    memory: body.memory,
    inventory: body.inventory?.slice?.(0, 50) ?? [],
    mealPlan: body.mealPlan?.slice?.(0, 7) ?? [],
    library: body.library?.slice?.(0, 20) ?? [],
    favoriteRestaurants: body.favoriteRestaurants?.slice?.(0, 30) ?? [],
    restaurants: body.restaurants?.slice?.(0, 5) ?? [],
    recipes: body.recipes?.slice?.(0, 5) ?? [],
    localDecision: body.decision,
    localAgents: body.agents,
    selectionPolicy: body.selectionPolicy,
  };

  return [
    {
      role: "system",
      content:
        "You are BepFlowAI's Decision Orchestrator. Coordinate Memory, Restaurant, Recipe, Inventory, Meal Planner, Schedule, Budget, and Decision agents. " +
        "Use only the provided JSON context, including the user's inventory, current meal plan, saved recipe library, substitution notes, and favorite restaurants when relevant. Do not mention any restaurant, recipe, city, cuisine, address, budget, time, rating, preference, or ingredient unless it appears in the JSON context. " +
        "Answer the user's actual question first. If they ask about their meal plan, summarize the provided mealPlan by day and do not replace it with a generic food recommendation. If they ask for a nearby cafe or restaurant, use only the provided Google Places candidates and prioritize the shortest distance. If requested data is absent, say so clearly. " +
        "Restaurants are Google Places candidates when their source is Google Places. Recipes may be TheMealDB or Spoonacular candidates according to their source field. " +
        "For eating out, choose only from restaurants. For cooking, choose from current recipe candidates or the saved library, and clearly identify a saved-library choice. Never invent alternatives. " +
        "Use localDecision only for eat-versus-cook decisions; it must not override direct cafe-search or meal-plan questions. " +
        "Return compact JSON only with keys: answer (string), agentNotes (array of exactly 7 short strings). " +
        "agentNotes must be exactly prefixed with Memory:, Restaurant:, Recipe:, Inventory:, Meal Planner:, Budget:, Decision:. " +
        "Keep the answer concise and grounded in concrete names and values from context.",
    },
    {
      role: "user",
      content: JSON.stringify(context),
    },
  ];
}

function parseQwenContent(content) {
  const raw = typeof content === "string" ? content : JSON.stringify(content);
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      source: "qwen",
      answer: String(parsed.answer || raw),
      agentNotes: normalizeAgentNotes(parsed.agentNotes),
    };
  } catch {
    return {
      source: "qwen",
      answer: raw,
      agentNotes: [],
    };
  }
}

function normalizeAgentNotes(notes) {
  const prefixes = ["Memory:", "Restaurant:", "Recipe:", "Inventory:", "Meal Planner:", "Budget:", "Decision:"];
  const rawNotes = Array.isArray(notes) ? notes.map(String) : [];
  return prefixes.map((prefix) => {
    const match = rawNotes.find((note) => note.trim().toLowerCase().startsWith(prefix.toLowerCase()));
    return match || `${prefix} Not specified by Qwen.`;
  });
}

const server = createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && requestUrl.pathname === "/api/spoonacular-recipes") {
    try {
      const query = requestUrl.searchParams.get("q")?.trim() || "chicken";
      sendJson(res, 200, await searchSpoonacularRecipes(query));
    } catch (error) {
      sendJson(res, 502, { error: error instanceof Error ? error.message : "Spoonacular request failed" });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/places-search") {
    try {
      const query = requestUrl.searchParams.get("q")?.trim() || "restaurants";
      const latitudeValue = requestUrl.searchParams.get("lat");
      const longitudeValue = requestUrl.searchParams.get("lng");
      const latitude = latitudeValue === null ? Number.NaN : Number(latitudeValue);
      const longitude = longitudeValue === null ? Number.NaN : Number(longitudeValue);
      sendJson(res, 200, await searchGooglePlaces(query, latitude, longitude));
    } catch (error) {
      sendJson(res, 200, {
        configured: true,
        places: [],
        warning: error instanceof Error ? error.message : "Google Places request failed",
      });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/api/meal-planner/tools") {
    sendJson(res, 200, { tools: mealPlannerTools });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/api/meal-planner/tools/call") {
    try {
      const body = await readJson(req);
      sendJson(res, 200, { result: runMealPlannerTool(body.name, body.arguments) });
    } catch (error) {
      sendJson(res, 400, { error: error instanceof Error ? error.message : "Meal planner tool failed" });
    }
    return;
  }

  if (req.method !== "POST" || requestUrl.pathname !== "/api/qwen-chat") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  try {
    const body = await readJson(req);
    const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
    if (!apiKey) {
      sendJson(res, 200, localDevelopmentResponse(body));
      return;
    }

    const qwenResponse = await fetch(DASH_SCOPE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.QWEN_MODEL || "qwen3.5-flash",
        messages: buildQwenMessages(body),
        temperature: 0.4,
        response_format: { type: "json_object" },
      }),
    });

    const data = await qwenResponse.json();
    if (!qwenResponse.ok) {
      sendJson(res, qwenResponse.status, {
        error: data?.message || data?.error?.message || "Qwen request failed",
      });
      return;
    }

    const content = data?.choices?.[0]?.message?.content ?? "";
    sendJson(res, 200, parseQwenContent(content));
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`BepFlowAI API listening on http://localhost:${PORT}`);
});
