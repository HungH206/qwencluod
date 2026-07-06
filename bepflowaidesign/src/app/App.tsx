import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  CalendarClock,
  Check,
  ChefHat,
  Clock,
  DollarSign,
  ExternalLink,
  Loader2,
  MapPin,
  MessageSquareText,
  Navigation,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Store,
  Target,
  Utensils,
  Wallet,
  X,
} from "lucide-react";

type Tab = "restaurants" | "recipes" | "chat";
type Mode = "restaurant" | "cook" | "prep";
type UserLocation = { lat: number; lng: number };

type Memory = {
  cuisines: string[];
  dislikes: string[];
  maxCookMinutes: number;
  weeklyBudget: number;
  spentThisWeek: number;
  ratings: { label: string; score: number; note: string }[];
};

type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  rating: number;
  price: string;
  distance: string;
  minutes: number;
  source: "Demo" | "Google Places";
  address: string;
};

type Recipe = {
  id: string;
  name: string;
  cuisine: string;
  time: string;
  source: "Demo" | "TheMealDB";
  image: string;
  instructions: string;
};

type Agent = {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  summary: string;
  evidence: string[];
  confidence: number;
};

type QwenChatResponse = {
  source: "qwen" | "local-dev";
  answer: string;
  agentNotes: string[];
};

type Decision = {
  winner: Mode;
  title: string;
  confidence: number;
  explanation: string;
  scores: Record<Mode, number>;
};

const memorySeed: Memory = {
  cuisines: ["Japanese", "Thai", "Mediterranean"],
  dislikes: ["cilantro", "long waits", "very spicy ramen"],
  maxCookMinutes: 25,
  weeklyBudget: 100,
  spentThisWeek: 58,
  ratings: [
    { label: "Sakura Sushi House", score: 5, note: "Fast, reliable dinner during a late coding night." },
    { label: "Bangkok Garden", score: 4, note: "Good value and strong Thai match." },
  ],
};

const demoRestaurants: Restaurant[] = [
  {
    id: "sakura",
    name: "Sakura Sushi House",
    cuisine: "Japanese",
    rating: 4.9,
    price: "$18-24",
    distance: "0.8 mi",
    minutes: 8,
    source: "Demo",
    address: "Mission District, San Francisco",
  },
  {
    id: "bangkok",
    name: "Bangkok Garden",
    cuisine: "Thai",
    rating: 4.7,
    price: "$12-18",
    distance: "1.2 mi",
    minutes: 11,
    source: "Demo",
    address: "Market Street, San Francisco",
  },
  {
    id: "mezze",
    name: "Mezze Table",
    cuisine: "Mediterranean",
    rating: 4.6,
    price: "$14-21",
    distance: "1.4 mi",
    minutes: 13,
    source: "Demo",
    address: "Hayes Valley, San Francisco",
  },
  {
    id: "pho",
    name: "Pho Saigon",
    cuisine: "Vietnamese",
    rating: 4.5,
    price: "$10-16",
    distance: "1.8 mi",
    minutes: 14,
    source: "Demo",
    address: "SOMA, San Francisco",
  },
];

const demoRecipes: Recipe[] = [
  {
    id: "thai-basil",
    name: "Thai Basil Chicken",
    cuisine: "Thai",
    time: "20 min",
    source: "Demo",
    image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80",
    instructions: "Stir-fry chicken with basil, garlic, chili, soy sauce, and rice. Skip cilantro based on memory.",
  },
  {
    id: "salmon-bowl",
    name: "Teriyaki Salmon Rice Bowl",
    cuisine: "Japanese",
    time: "22 min",
    source: "Demo",
    image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=900&q=80",
    instructions: "Sear salmon, glaze with teriyaki, and serve over rice with spinach.",
  },
  {
    id: "chicken-rice",
    name: "Chicken Spinach Rice Bowl",
    cuisine: "Weeknight",
    time: "18 min",
    source: "Demo",
    image: "https://images.unsplash.com/photo-1543353071-10c8ba85a904?auto=format&fit=crop&w=900&q=80",
    instructions: "Cook chicken, wilt spinach, and finish with lemon over rice.",
  },
];

const prompts = [
  "I'm coding until midnight and need something fast.",
  "I have 45 minutes free, chicken, rice, and spinach at home.",
  "I'm trying to save money this week but still want Thai food.",
];

function loadMemory() {
  try {
    const raw = window.localStorage.getItem("bepflowai-memory");
    return raw ? ({ ...memorySeed, ...JSON.parse(raw) } as Memory) : memorySeed;
  } catch {
    return memorySeed;
  }
}

function inferContext(text: string) {
  const lower = text.toLowerCase();
  return {
    busy: ["busy", "coding", "midnight", "fast", "quick"].some((word) => lower.includes(word)),
    saveMoney: ["save", "budget", "cheap"].some((word) => lower.includes(word)),
    hasIngredients: ["chicken", "rice", "spinach", "home"].some((word) => lower.includes(word)),
    wantsThai: lower.includes("thai"),
  };
}

function buildDecision(prompt: string, memory: Memory, restaurants: Restaurant[], recipes: Recipe[]): Decision {
  const context = inferContext(prompt);
  const remaining = memory.weeklyBudget - memory.spentThisWeek;
  let restaurant = 66;
  let cook = 58;
  let prep = 48;

  if (context.busy) {
    restaurant += 24;
    cook -= 14;
  }
  if (context.saveMoney || remaining < 35) {
    cook += 24;
    prep += 18;
    restaurant -= 16;
  }
  if (context.hasIngredients) {
    cook += 24;
    prep += 10;
  }
  if (context.wantsThai || memory.cuisines.includes("Thai")) {
    restaurant += 7;
    cook += 5;
  }

  const scores = {
    restaurant: Math.max(0, Math.min(98, restaurant)),
    cook: Math.max(0, Math.min(98, cook)),
    prep: Math.max(0, Math.min(98, prep)),
  };
  const winner = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] as Mode;
  const confidence = scores[winner];
  const topRestaurant = restaurants.find((item) => item.cuisine === "Thai") ?? restaurants[0];
  const topRecipe = recipes.find((item) => item.cuisine === "Thai") ?? recipes[0];

  if (winner === "cook") {
    return {
      winner,
      confidence,
      title: `Cook ${topRecipe.name}`,
      explanation:
        "The Recipe Agent wins because your ingredients and budget fit a fast home-cooked option, and the meal stays under your preferred cook time.",
      scores,
    };
  }

  if (winner === "prep") {
    return {
      winner,
      confidence,
      title: "Meal prep two bowls",
      explanation:
        "Meal prep wins because it preserves budget and gives tomorrow's schedule a ready meal without another decision.",
      scores,
    };
  }

  return {
    winner,
    confidence,
    title: `Eat at ${topRestaurant.name}`,
    explanation:
      "The Restaurant Agent wins because your schedule is compressed, the option is nearby, and it matches cuisine memory without exceeding the weekly budget.",
    scores,
  };
}

function buildAgents(prompt: string, memory: Memory, decision: Decision, restaurants: Restaurant[], recipes: Recipe[]): Agent[] {
  const context = inferContext(prompt);
  const googleCount = restaurants.filter((item) => item.source === "Google Places").length;
  const mealDbCount = recipes.filter((item) => item.source === "TheMealDB").length;
  return [
    {
      id: "memory",
      name: "Memory Agent",
      icon: Brain,
      color: "#2563eb",
      confidence: 96,
      summary: `Loaded ${memory.cuisines.length} cuisine preferences, budget state, and feedback history.`,
      evidence: [`Likes ${memory.cuisines.join(", ")}`, `Avoids ${memory.dislikes.join(", ")}`, `Cook limit: ${memory.maxCookMinutes} minutes`],
    },
    {
      id: "restaurant",
      name: "Restaurant Agent",
      icon: Store,
      color: "#dc2626",
      confidence: decision.scores.restaurant,
      summary: googleCount ? `Merged ${googleCount} Google Places results with local scoring.` : "Using demo restaurants until Google Places key is configured.",
      evidence: restaurants.slice(0, 3).map((item) => `${item.name}: ${item.cuisine}, ${item.rating} stars, ${item.minutes} minutes`),
    },
    {
      id: "recipe",
      name: "Recipe Agent",
      icon: ChefHat,
      color: "#16a34a",
      confidence: decision.scores.cook,
      summary: mealDbCount ? `Loaded ${mealDbCount} recipes from TheMealDB.` : "Using fallback recipes while TheMealDB results load.",
      evidence: recipes.slice(0, 3).map((item) => `${item.name}: ${item.cuisine}, ${item.time}`),
    },
    {
      id: "schedule",
      name: "Schedule Agent",
      icon: CalendarClock,
      color: "#7c3aed",
      confidence: context.busy ? 92 : 78,
      summary: context.busy ? "Detected a tight schedule from the prompt." : "Detected enough flexibility for cooking.",
      evidence: [context.busy ? "Prompt implies low available time" : "No hard deadline detected", context.hasIngredients ? "Home ingredients mentioned" : "No pantry detail supplied"],
    },
    {
      id: "budget",
      name: "Budget Agent",
      icon: Wallet,
      color: "#d97706",
      confidence: 90,
      summary: `$${memory.weeklyBudget - memory.spentThisWeek} remains from this week's food budget.`,
      evidence: [context.saveMoney ? "User asked to save money" : "No explicit savings constraint", `Weekly budget: $${memory.weeklyBudget}`],
    },
    {
      id: "decision",
      name: "Decision Agent",
      icon: Target,
      color: "#0f172a",
      confidence: decision.confidence,
      summary: `${decision.title} wins at ${decision.confidence}% confidence.`,
      evidence: [`Restaurant ${decision.scores.restaurant}%`, `Cook ${decision.scores.cook}%`, `Meal prep ${decision.scores.prep}%`],
    },
  ];
}

function rankRestaurants(restaurants: Restaurant[], memory: Memory) {
  return restaurants
    .map((restaurant) => ({
      ...restaurant,
      agentScore:
        restaurant.rating * 12 +
        Math.max(0, 30 - restaurant.minutes) +
        (memory.cuisines.includes(restaurant.cuisine) ? 18 : 0) +
        (restaurant.source === "Google Places" ? 8 : 0),
    }))
    .sort((a, b) => b.agentScore - a.agentScore);
}

function rankRecipes(recipes: Recipe[], memory: Memory) {
  return recipes
    .map((recipe) => ({
      ...recipe,
      agentScore:
        (memory.cuisines.includes(recipe.cuisine) ? 18 : 0) +
        (recipe.source === "TheMealDB" ? 10 : 0) +
        (recipe.time.includes("20") ? 8 : 0),
    }))
    .sort((a, b) => b.agentScore - a.agentScore);
}

async function fetchMealDbRecipes(query: string): Promise<Recipe[]> {
  const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error("TheMealDB request failed");
  const data = (await response.json()) as {
    meals: null | Array<{
      idMeal: string;
      strMeal: string;
      strArea?: string;
      strMealThumb?: string;
      strInstructions?: string;
    }>;
  };

  return (data.meals ?? []).slice(0, 6).map((meal) => ({
    id: meal.idMeal,
    name: meal.strMeal,
    cuisine: meal.strArea || "Global",
    time: "20-35 min",
    source: "TheMealDB",
    image: meal.strMealThumb || demoRecipes[0].image,
    instructions: meal.strInstructions || "Recipe details available from TheMealDB.",
  }));
}

async function fetchGooglePlacesRestaurants(query: string, location: UserLocation | null): Promise<Restaurant[]> {
  const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined;
  if (!key) return [];

  const requestBody = {
    textQuery: location ? `${query} restaurants` : `${query} restaurants near San Francisco`,
    maxResultCount: 6,
    ...(location
      ? {
          locationBias: {
            circle: {
              center: {
                latitude: location.lat,
                longitude: location.lng,
              },
              radius: 5000,
            },
          },
        }
      : {}),
  };

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.rating,places.priceLevel,places.types",
    },
    body: JSON.stringify(requestBody),
  });
  if (!response.ok) throw new Error("Google Places request failed");
  const data = (await response.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      rating?: number;
      priceLevel?: string;
      types?: string[];
    }>;
  };

  return (data.places ?? []).map((place, index) => ({
    id: place.id,
    name: place.displayName?.text ?? "Restaurant",
    cuisine: cuisineFromTypes(place.types ?? [], query),
    rating: place.rating ?? 4.3,
    price: priceFromGoogleLevel(place.priceLevel),
    distance: `${(0.7 + index * 0.4).toFixed(1)} mi`,
    minutes: 8 + index * 3,
    source: "Google Places",
    address: place.formattedAddress ?? "San Francisco",
  }));
}

function cuisineFromTypes(types: string[], fallback: string) {
  if (types.some((type) => type.includes("japanese"))) return "Japanese";
  if (types.some((type) => type.includes("thai"))) return "Thai";
  if (types.some((type) => type.includes("vietnamese"))) return "Vietnamese";
  if (types.some((type) => type.includes("mediterranean"))) return "Mediterranean";
  return fallback || "Restaurant";
}

function priceFromGoogleLevel(level?: string) {
  const map: Record<string, string> = {
    PRICE_LEVEL_INEXPENSIVE: "$",
    PRICE_LEVEL_MODERATE: "$$",
    PRICE_LEVEL_EXPENSIVE: "$$$",
    PRICE_LEVEL_VERY_EXPENSIVE: "$$$$",
  };
  return level ? map[level] ?? "$$" : "$$";
}

function Badge({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "blue" | "amber" | "rose" | "slate" }) {
  const tones = {
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

function ScoreBar({ label, value, active }: { label: string; value: number; active?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className={active ? "font-bold text-slate-950" : "font-medium text-slate-500"}>{label}</span>
        <span className="font-mono text-slate-500">{value}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-slate-100">
        <div className={`h-full rounded ${active ? "bg-emerald-500" : "bg-slate-300"}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [memory, setMemory] = useState<Memory>(() => loadMemory());
  const [prompt, setPrompt] = useState(prompts[0]);
  const [submitted, setSubmitted] = useState(prompts[0]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>(demoRestaurants);
  const [recipes, setRecipes] = useState<Recipe[]>(demoRecipes);
  const [restaurantQuery, setRestaurantQuery] = useState("Thai");
  const [recipeQuery, setRecipeQuery] = useState("chicken");
  const [loadingRestaurants, setLoadingRestaurants] = useState(false);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState("Using default area: San Francisco");
  const [running, setRunning] = useState(false);
  const [stars, setStars] = useState(0);
  const [qwenResponse, setQwenResponse] = useState<QwenChatResponse | null>(null);
  const [qwenError, setQwenError] = useState("");

  const decision = useMemo(() => buildDecision(submitted, memory, restaurants, recipes), [submitted, memory, restaurants, recipes]);
  const agents = useMemo(() => buildAgents(submitted, memory, decision, restaurants, recipes), [submitted, memory, decision, restaurants, recipes]);

  useEffect(() => {
    window.localStorage.setItem("bepflowai-memory", JSON.stringify(memory));
  }, [memory]);

  useEffect(() => {
    void loadRecipes("chicken");
  }, []);

  async function loadRecipes(query = recipeQuery) {
    setLoadingRecipes(true);
    try {
      const liveRecipes = await fetchMealDbRecipes(query);
      setRecipes(liveRecipes.length ? liveRecipes : demoRecipes);
    } catch {
      setRecipes(demoRecipes);
    } finally {
      setLoadingRecipes(false);
    }
  }

  async function loadRestaurants(query = restaurantQuery, locationOverride?: UserLocation | null) {
    const searchLocation = locationOverride === undefined ? userLocation : locationOverride;
    setLoadingRestaurants(true);
    try {
      const liveRestaurants = await fetchGooglePlacesRestaurants(query, searchLocation);
      setRestaurants(liveRestaurants.length ? liveRestaurants : demoRestaurants.filter((item) => item.cuisine === query || query === "All").concat(demoRestaurants.filter((item) => item.cuisine !== query)));
    } catch {
      setRestaurants(demoRestaurants);
    } finally {
      setLoadingRestaurants(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not available in this browser");
      return;
    }

    setLocationStatus("Requesting location permission...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setUserLocation(nextLocation);
        setLocationStatus("Searching near your current location");
        void loadRestaurants(restaurantQuery, nextLocation);
      },
      () => {
        setUserLocation(null);
        setLocationStatus("Location denied. Using default area: San Francisco");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }

  async function runOrchestrator(nextPrompt = prompt) {
    if (!nextPrompt.trim()) return;
    setPrompt(nextPrompt);
    setSubmitted(nextPrompt);
    setTab("chat");
    setRunning(true);
    setStars(0);
    setQwenError("");
    setQwenResponse(null);

    try {
      const nextDecision = buildDecision(nextPrompt, memory, restaurants, recipes);
      const nextAgents = buildAgents(nextPrompt, memory, nextDecision, restaurants, recipes);
      const rankedRestaurants = rankRestaurants(restaurants, memory).slice(0, 6);
      const rankedRecipes = rankRecipes(recipes, memory).slice(0, 6);
      const response = await fetch("/api/qwen-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          userContext: inferContext(nextPrompt),
          memory,
          restaurants: rankedRestaurants,
          recipes: rankedRecipes,
          decision: nextDecision,
          agents: nextAgents,
          selectionPolicy: {
            restaurantSource: "Google Places candidates when available; demo candidates otherwise",
            recipeSource: "TheMealDB candidates when available; demo candidates otherwise",
            instruction: "Choose eating out only from restaurants. Choose cooking only from recipes. If the requested city, cuisine, or dish is not represented, say that clearly.",
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Qwen backend request failed");
      setQwenResponse(data as QwenChatResponse);
    } catch (error) {
      setQwenError(error instanceof Error ? error.message : "Qwen backend request failed");
    } finally {
      setRunning(false);
    }
  }

  function rate(score: number) {
    setStars(score);
    setMemory((current) => ({
      ...current,
      spentThisWeek: Math.min(current.weeklyBudget, current.spentThisWeek + (score >= 4 ? 18 : 0)),
      ratings: [
        {
          label: decision.title,
          score,
          note: score >= 4 ? "Positive feedback reinforced this recommendation path." : "Lower rating will reduce similar picks.",
        },
        ...current.ratings,
      ].slice(0, 6),
    }));
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto min-h-screen w-full max-w-[1440px]">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur md:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
                <Utensils size={22} />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tight">BepFlowAI</h1>
                <p className="text-sm text-slate-500">Food decisions powered by restaurant, recipe, and memory agents</p>
              </div>
            </div>
            <nav className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[
                { id: "restaurants", label: "Restaurants", icon: Store },
                { id: "recipes", label: "Recipes", icon: ChefHat },
                { id: "chat", label: "Chat with Agents", icon: MessageSquareText },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id as Tab)}
                    className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm font-bold transition ${tab === item.id ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                  >
                    <Icon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 p-5 md:p-8 xl:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            {tab === "restaurants" && (
              <RestaurantsTab
                restaurants={restaurants}
                query={restaurantQuery}
                loading={loadingRestaurants}
                locationStatus={locationStatus}
                hasLocation={Boolean(userLocation)}
                onQuery={setRestaurantQuery}
                onSearch={loadRestaurants}
                onUseLocation={useCurrentLocation}
              />
            )}
            {tab === "recipes" && (
              <RecipesTab recipes={recipes} query={recipeQuery} loading={loadingRecipes} onQuery={setRecipeQuery} onSearch={loadRecipes} />
            )}
            {tab === "chat" && (
              <ChatTab
                prompt={prompt}
                submitted={submitted}
                decision={decision}
                agents={agents}
                running={running}
                stars={stars}
                qwenResponse={qwenResponse}
                qwenError={qwenError}
                onPrompt={setPrompt}
                onRun={runOrchestrator}
                onRate={rate}
              />
            )}
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black">Orchestrator Snapshot</h2>
                  <p className="text-sm text-slate-500">Always visible while judges switch tabs.</p>
                </div>
                <Badge tone={running ? "amber" : "green"}>
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {running ? "Running" : "Ready"}
                </Badge>
              </div>
              <div className="mt-4 rounded-lg bg-slate-950 p-4 text-white">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Recommendation</p>
                <p className="mt-2 text-2xl font-black leading-tight">{decision.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{decision.explanation}</p>
              </div>
              <div className="mt-4 space-y-3">
                <ScoreBar label="Restaurant" value={decision.scores.restaurant} active={decision.winner === "restaurant"} />
                <ScoreBar label="Cook" value={decision.scores.cook} active={decision.winner === "cook"} />
                <ScoreBar label="Meal prep" value={decision.scores.prep} active={decision.winner === "prep"} />
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-black">Memory</h2>
                <Brain size={20} className="text-blue-600" />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-400">Budget left</p>
                  <p className="mt-1 text-2xl font-black">${memory.weeklyBudget - memory.spentThisWeek}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-400">Cook limit</p>
                  <p className="mt-1 text-2xl font-black">{memory.maxCookMinutes}m</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {memory.cuisines.map((cuisine) => (
                  <Badge key={cuisine} tone="blue">{cuisine}</Badge>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {memory.ratings.slice(0, 2).map((item) => (
                  <div key={`${item.label}-${item.note}`} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold">{item.label}</p>
                      <span className="font-mono text-xs text-amber-600">{item.score}/5</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

function SearchHeader({
  title,
  subtitle,
  query,
  loading,
  placeholder,
  onQuery,
  onSearch,
}: {
  title: string;
  subtitle: string;
  query: string;
  loading: boolean;
  placeholder: string;
  onQuery: (value: string) => void;
  onSearch: (value?: string) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onSearch(query)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none ring-emerald-500 focus:bg-white focus:ring-2"
              placeholder={placeholder}
            />
          </div>
          <button
            onClick={() => onSearch(query)}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
            Search
          </button>
        </div>
      </div>
    </section>
  );
}

function RestaurantsTab({
  restaurants,
  query,
  loading,
  locationStatus,
  hasLocation,
  onQuery,
  onSearch,
  onUseLocation,
}: {
  restaurants: Restaurant[];
  query: string;
  loading: boolean;
  locationStatus: string;
  hasLocation: boolean;
  onQuery: (value: string) => void;
  onSearch: (value?: string, locationOverride?: UserLocation | null) => void;
  onUseLocation: () => void;
}) {
  const cuisineTypes = Array.from(new Set(restaurants.map((item) => item.cuisine)));
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedRestaurant(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <>
      <SearchHeader
        title="Restaurants"
        subtitle="Restaurant Agent ranks available places by cuisine fit, distance, budget, rating, and memory."
        query={query}
        loading={loading}
        placeholder="Thai, sushi, Mediterranean..."
        onQuery={onQuery}
        onSearch={onSearch}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {cuisineTypes.map((cuisine) => (
                <button
                  key={cuisine}
                  onClick={() => {
                    onQuery(cuisine);
                    onSearch(cuisine);
                  }}
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  {cuisine}
                </button>
              ))}
              <button
                onClick={onUseLocation}
                className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-100"
              >
                <Navigation size={15} />
                Use my location
              </button>
            </div>
            <p className="text-xs font-medium text-slate-500">
              {hasLocation ? "Location enabled. " : ""}
              {locationStatus}
            </p>
          </div>
          <Badge tone={restaurants.some((item) => item.source === "Google Places") ? "green" : "amber"}>
            <MapPin size={13} />
            {restaurants.some((item) => item.source === "Google Places") ? "Google Places live" : "Demo fallback"}
          </Badge>
        </div>
        <div className="space-y-3">
          {restaurants.map((restaurant) => (
            <article
              key={restaurant.id}
              tabIndex={0}
              role="button"
              onClick={() => setSelectedRestaurant(restaurant)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedRestaurant(restaurant);
                }
              }}
              className="rounded-lg border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:cursor-pointer hover:border-emerald-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                    <MapPin size={22} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black">{restaurant.name}</h3>
                      <Badge tone={restaurant.source === "Google Places" ? "green" : "slate"}>{restaurant.source}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{restaurant.cuisine} · {restaurant.address}</p>
                    <p className="mt-2 text-xs font-semibold text-emerald-700">Select to view this location on Google Maps</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4 lg:w-[430px]">
                  <Metric icon={Star} label="Rating" value={restaurant.rating.toFixed(1)} />
                  <Metric icon={DollarSign} label="Price" value={restaurant.price} />
                  <Metric icon={Navigation} label="Distance" value={restaurant.distance} />
                  <Metric icon={Clock} label="Time" value={`${restaurant.minutes}m`} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      {selectedRestaurant && (
        <RestaurantMapWindow restaurant={selectedRestaurant} onClose={() => setSelectedRestaurant(null)} />
      )}
    </>
  );
}

function RestaurantMapWindow({ restaurant, onClose }: { restaurant: Restaurant; onClose: () => void }) {
  const mapQuery = `${restaurant.name}, ${restaurant.address}`;
  const encodedQuery = encodeURIComponent(mapQuery);
  const embedUrl = `https://www.google.com/maps?q=${encodedQuery}&output=embed`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Google Maps location</p>
            <h2 className="truncate text-xl font-black">{restaurant.name}</h2>
            <p className="truncate text-sm text-slate-500">{restaurant.cuisine} · {restaurant.address}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close map"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[1fr_300px]">
          <div className="min-h-[420px] bg-slate-100">
            <iframe
              title={`${restaurant.name} on Google Maps`}
              src={embedUrl}
              className="h-full min-h-[420px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <aside className="border-t border-slate-200 p-4 lg:border-l lg:border-t-0">
            <Badge tone={restaurant.source === "Google Places" ? "green" : "slate"}>{restaurant.source}</Badge>
            <h3 className="mt-4 text-lg font-black">{restaurant.name}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">{restaurant.address}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Metric icon={Star} label="Rating" value={restaurant.rating.toFixed(1)} />
              <Metric icon={DollarSign} label="Price" value={restaurant.price} />
              <Metric icon={Navigation} label="Distance" value={restaurant.distance} />
              <Metric icon={Clock} label="Time" value={`${restaurant.minutes}m`} />
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"
            >
              <ExternalLink size={16} />
              Open in Google Maps
            </a>
            <button
              onClick={onClose}
              className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
            >
              Done
            </button>
          </aside>
        </div>
      </section>
    </div>
  );
}

function RecipesTab({
  recipes,
  query,
  loading,
  onQuery,
  onSearch,
}: {
  recipes: Recipe[];
  query: string;
  loading: boolean;
  onQuery: (value: string) => void;
  onSearch: (value?: string) => void;
}) {
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedRecipe(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <>
      <SearchHeader
        title="Recipes"
        subtitle="Recipe Agent uses TheMealDB results, then scores them against memory, time, and available ingredients."
        query={query}
        loading={loading}
        placeholder="chicken, pasta, curry..."
        onQuery={onQuery}
        onSearch={onSearch}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black">Recipe Candidates</h3>
            <p className="text-sm text-slate-500">TheMealDB powers search; demo fallbacks keep the pitch reliable offline.</p>
          </div>
          <Badge tone={recipes.some((item) => item.source === "TheMealDB") ? "green" : "amber"}>
            <ExternalLink size={13} />
            {recipes.some((item) => item.source === "TheMealDB") ? "TheMealDB live" : "Demo fallback"}
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {recipes.map((recipe) => (
            <article
              key={recipe.id}
              tabIndex={0}
              role="button"
              onClick={() => setSelectedRecipe(recipe)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedRecipe(recipe);
                }
              }}
              className="overflow-hidden rounded-lg border border-slate-200 transition hover:-translate-y-0.5 hover:cursor-pointer hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <div className="h-40 bg-slate-100">
                <img src={recipe.image} alt={recipe.name} className="h-full w-full object-cover" />
              </div>
              <div className="p-4">
                <Badge tone={recipe.source === "TheMealDB" ? "green" : "slate"}>{recipe.source}</Badge>
                <h3 className="mt-3 text-base font-black leading-tight">{recipe.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{recipe.cuisine} · {recipe.time}</p>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{recipe.instructions}</p>
                <button className="mt-4 inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-xs font-black text-white">
                  View recipe
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
      {selectedRecipe && <RecipeDetailWindow recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} />}
    </>
  );
}

function RecipeDetailWindow({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const steps = recipe.instructions
    .split(/\r?\n+/)
    .map((step) => step.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Recipe window</p>
            <h2 className="truncate text-xl font-black">{recipe.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close recipe"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[360px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50 p-4 md:border-b-0 md:border-r">
            <div className="overflow-hidden rounded-lg bg-slate-200">
              <img src={recipe.image} alt={recipe.name} className="h-64 w-full object-cover md:h-80" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Metric icon={ChefHat} label="Cuisine" value={recipe.cuisine} />
              <Metric icon={Clock} label="Time" value={recipe.time} />
            </div>
            <div className="mt-3">
              <Badge tone={recipe.source === "TheMealDB" ? "green" : "slate"}>{recipe.source}</Badge>
            </div>
          </aside>

          <div className="p-5">
            <div className="mb-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
              <h3 className="text-sm font-black text-emerald-900">Cook mode</h3>
              <p className="mt-1 text-sm leading-6 text-emerald-800">
                Keep this window open while cooking. When you are finished, press Done Cooking to close it and move on.
              </p>
            </div>

            <h3 className="text-base font-black">Instructions</h3>
            <div className="mt-3 space-y-3">
              {(steps.length ? steps : [recipe.instructions]).map((step, index) => (
                <div key={`${step}-${index}`} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-slate-950 text-xs font-black text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
          <p className="text-sm text-slate-500">Use Escape, Close, or Done Cooking to exit this recipe.</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
              Close
            </button>
            <button onClick={onClose} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700">
              Done Cooking
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChatTab({
  prompt,
  submitted,
  decision,
  agents,
  running,
  stars,
  qwenResponse,
  qwenError,
  onPrompt,
  onRun,
  onRate,
}: {
  prompt: string;
  submitted: string;
  decision: Decision;
  agents: Agent[];
  running: boolean;
  stars: number;
  qwenResponse: QwenChatResponse | null;
  qwenError: string;
  onPrompt: (value: string) => void;
  onRun: (value?: string) => void;
  onRate: (score: number) => void;
}) {
  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Chat with Agents</h2>
            <p className="mt-1 text-sm text-slate-500">One prompt goes to the orchestrator, then each specialized agent reports evidence.</p>
          </div>
          <button
            onClick={() => onRun(prompts[(prompts.indexOf(submitted) + 1) % prompts.length])}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw size={15} />
            Scenario
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <MessageSquareText className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              value={prompt}
              onChange={(event) => onPrompt(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onRun()}
              className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none ring-emerald-500 focus:bg-white focus:ring-2"
              placeholder="Tell BepFlowAI about your day..."
            />
          </div>
          <button onClick={() => onRun()} className="inline-flex h-12 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800">
            <Send size={16} />
            Run
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black">Qwen Orchestrator</h3>
            <p className="text-sm text-slate-500">Backend-generated response from the current app context.</p>
          </div>
          <Badge tone={qwenResponse?.source === "qwen" ? "green" : qwenError ? "rose" : "amber"}>
            {running ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {running ? "Calling Qwen" : qwenResponse?.source === "qwen" ? "Qwen live" : qwenResponse?.source === "local-dev" ? "Local dev" : qwenError ? "Backend error" : "Ready"}
          </Badge>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          {running && <p className="text-sm leading-6 text-slate-600">Qwen is coordinating the Memory, Restaurant, Recipe, Schedule, Budget, and Decision agents...</p>}
          {!running && qwenResponse && (
            <div>
              <p className="text-sm leading-6 text-slate-800">{qwenResponse.answer}</p>
              {qwenResponse.agentNotes.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {qwenResponse.agentNotes.map((note) => (
                    <li key={note} className="flex gap-2 text-xs leading-5 text-slate-500">
                      <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-emerald-500" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!running && qwenError && <p className="text-sm leading-6 text-rose-700">{qwenError}</p>}
          {!running && !qwenResponse && !qwenError && (
            <p className="text-sm leading-6 text-slate-500">Run a prompt to generate a Qwen-backed agent response.</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="rounded-lg bg-slate-950 p-5 text-white">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green"><Target size={13} />Final recommendation</Badge>
            <Badge tone="slate">{decision.confidence}% confidence</Badge>
          </div>
          <h3 className="mt-4 text-3xl font-black tracking-tight">{decision.title}</h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">{decision.explanation}</p>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
            <ScoreBar label="Restaurant" value={decision.scores.restaurant} active={decision.winner === "restaurant"} />
            <ScoreBar label="Cook" value={decision.scores.cook} active={decision.winner === "cook"} />
            <ScoreBar label="Meal prep" value={decision.scores.prep} active={decision.winner === "prep"} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {agents.map((agent, index) => (
          <AgentCard key={agent.id} agent={agent} running={running && index > 0} />
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Feedback Updates Memory</h2>
            <p className="text-sm text-slate-500">The next decision changes after rating the recommendation.</p>
          </div>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((score) => (
              <button key={score} onClick={() => onRate(score)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-amber-50">
                <Star size={18} className={score <= stars ? "fill-amber-400 text-amber-400" : "text-slate-300"} />
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function AgentCard({ agent, running }: { agent: Agent; running: boolean }) {
  const Icon = agent.icon;
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${agent.color}14` }}>
            <Icon size={20} style={{ color: agent.color }} />
          </div>
          <div>
            <h3 className="text-sm font-black">{agent.name}</h3>
            <p className="text-xs text-slate-500">{agent.confidence}% confidence</p>
          </div>
        </div>
        <Badge tone={running ? "amber" : "green"}>
          {running ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {running ? "Running" : "Done"}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-700">{agent.summary}</p>
      <ul className="mt-3 space-y-2">
        {agent.evidence.map((item) => (
          <li key={item} className="flex gap-2 text-xs leading-5 text-slate-500">
            <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full" style={{ backgroundColor: agent.color }} />
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}

function Metric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <Icon size={14} className="text-slate-500" />
      <p className="mt-1 text-xs text-slate-400">{label}</p>
      <p className="text-sm font-black">{value}</p>
    </div>
  );
}

export default App;
