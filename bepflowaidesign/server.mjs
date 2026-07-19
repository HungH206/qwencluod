import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.API_PORT || 8787);
const DASH_SCOPE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "http://localhost:5173",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  const url = new URL("https://api.spoonacular.com/recipes/complexSearch");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("query", query);
  url.searchParams.set("number", "18");
  url.searchParams.set("addRecipeInformation", "true");
  url.searchParams.set("fillIngredients", "true");

  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "Spoonacular request failed");
  }

  return {
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
      "Budget: checked remaining weekly spend.",
      "Decision: produced a deterministic recommendation while waiting for DASHSCOPE_API_KEY.",
    ],
  };
}

function buildQwenMessages(body) {
  const context = {
    userPrompt: body.prompt,
    userContext: body.userContext,
    memory: body.memory,
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
        "You are BepFlowAI's Decision Orchestrator. Coordinate Memory, Restaurant, Recipe, Schedule, Budget, and Decision agents. " +
        "Use only the provided JSON context. Do not mention any restaurant, recipe, city, cuisine, address, budget, time, rating, preference, or ingredient unless it appears in the JSON context. " +
        "If the user asks for a city, cuisine, dish, restaurant, or ingredient that is not represented in the candidate data, say it is not available in the current app context and recommend the closest available candidate. " +
        "Restaurants are Google Places candidates when their source is Google Places. Recipes may be TheMealDB or Spoonacular candidates according to their source field. " +
        "For eating out, choose only from restaurants. For cooking, choose only from recipes. Never invent alternatives. " +
        "Prefer the localDecision winner unless the ranked restaurant/recipe data strongly contradicts it. " +
        "Return compact JSON only with keys: answer (string), agentNotes (array of exactly 5 short strings). " +
        "agentNotes must be exactly prefixed with Memory:, Restaurant:, Recipe:, Budget:, Decision:. " +
        "The answer should recommend eat out, cook, or meal prep in 3-5 sentences with concrete candidate names from the context.",
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
  const prefixes = ["Memory:", "Restaurant:", "Recipe:", "Budget:", "Decision:"];
  const rawNotes = Array.isArray(notes) ? notes.map(String) : [];
  return prefixes.map((prefix) => {
    const match = rawNotes.find((note) => note.trim().toLowerCase().startsWith(prefix.toLowerCase()));
    return match || `${prefix} Not specified by Qwen.`;
  });
}

const server = createServer(async (req, res) => {
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

server.listen(PORT, () => {
  console.log(`BepFlowAI API listening on http://localhost:${PORT}`);
});
