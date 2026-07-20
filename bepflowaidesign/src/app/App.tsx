import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  BookOpen,
  CalendarClock,
  CalendarDays,
  Check,
  ChefHat,
  Clock,
  DollarSign,
  ExternalLink,
  Loader2,
  List,
  LayoutGrid,
  MapPin,
  MessageSquareText,
  Navigation,
  Package,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Sparkles,
  Star,
  Store,
  Target,
  Trash2,
  Utensils,
  Wallet,
  X,
} from "lucide-react";

type Tab = "restaurants" | "recipes" | "inventory" | "planner" | "chat" | "library";

// Production requests stay on the Vercel origin and are forwarded by
// vercel.json. This avoids browser CORS enforcement against Function Compute.
const API_BASE_URL = import.meta.env.PROD
  ? ""
  : String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

type InventoryItem = {
  id: string;
  name: string;
  quantity: string;
};

type MealPlanEntry = {
  day: string;
  recipeId: string;
  recipeName: string;
  source: string;
  ingredients: string[];
};

type SavedRecipe = {
  id: string;
  name: string;
  author: string;
  ingredients: string;
  instructions: string;
  link: string;
  tags: string[];
  source: "Manual" | "Link" | "Import";
  savedAt: string;
  substitutionNotes?: string;
};

type SavedRestaurant = Restaurant & { savedAt: string };

type SavedRecipeForm = {
  name: string;
  author: string;
  ingredients: string;
  instructions: string;
  link: string;
  tags: string;
};

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
  source: "Demo" | "TheMealDB" | "Spoonacular";
  image: string;
  ingredients: string[];
  instructions: string;
  sourceUrl?: string;
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
    ingredients: ["Chicken", "Thai basil", "Garlic", "Chili", "Soy sauce", "Rice"],
    instructions: "Stir-fry chicken with basil, garlic, chili, soy sauce, and rice. Skip cilantro based on memory.",
  },
  {
    id: "salmon-bowl",
    name: "Teriyaki Salmon Rice Bowl",
    cuisine: "Japanese",
    time: "22 min",
    source: "Demo",
    image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?auto=format&fit=crop&w=900&q=80",
    ingredients: ["Salmon", "Teriyaki sauce", "Rice", "Spinach"],
    instructions: "Sear salmon, glaze with teriyaki, and serve over rice with spinach.",
  },
  {
    id: "chicken-rice",
    name: "Chicken Spinach Rice Bowl",
    cuisine: "Weeknight",
    time: "18 min",
    source: "Demo",
    image: "https://images.unsplash.com/photo-1543353071-10c8ba85a904?auto=format&fit=crop&w=900&q=80",
    ingredients: ["Chicken", "Spinach", "Rice", "Lemon"],
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

function loadSavedRecipes() {
  try {
    const raw = window.localStorage.getItem("bepflowai-saved-recipes");
    return raw ? (JSON.parse(raw) as SavedRecipe[]) : [];
  } catch {
    return [];
  }
}

function createSavedRecipe(data: Omit<SavedRecipe, "id" | "savedAt">): SavedRecipe {
  return {
    ...data,
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `recipe-${Date.now()}`,
    savedAt: new Date().toISOString(),
  };
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
  const spoonacularCount = recipes.filter((item) => item.source === "Spoonacular").length;
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
      summary: mealDbCount || spoonacularCount
        ? `Loaded ${mealDbCount} TheMealDB and ${spoonacularCount} Spoonacular recipes.`
        : "Using fallback recipes while recipe results load.",
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
        (recipe.source === "TheMealDB" || recipe.source === "Spoonacular" ? 10 : 0) +
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
      strSource?: string;
      strYoutube?: string;
      [key: string]: string | undefined;
    }>;
  };

  return (data.meals ?? []).slice(0, 6).map((meal) => {
    const ingredients = Array.from({ length: 20 }, (_, index) => {
      const ingredient = meal[`strIngredient${index + 1}`]?.trim();
      const measure = meal[`strMeasure${index + 1}`]?.trim();
      return ingredient ? [measure, ingredient].filter(Boolean).join(" ") : "";
    }).filter(Boolean);

    return {
      id: meal.idMeal,
      name: meal.strMeal,
      cuisine: meal.strArea || "Global",
      time: "20-35 min",
      source: "TheMealDB",
      image: meal.strMealThumb || demoRecipes[0].image,
      ingredients,
      instructions: meal.strInstructions || "Recipe details available from TheMealDB.",
      sourceUrl: meal.strSource?.trim() || meal.strYoutube?.trim() || `https://www.themealdb.com/meal/${meal.idMeal}`,
    };
  });
}

function loadSavedRestaurants(): SavedRestaurant[] {
  try {
    const raw = window.localStorage.getItem("bepflowai-saved-restaurants");
    return raw ? (JSON.parse(raw) as SavedRestaurant[]) : [];
  } catch {
    return [];
  }
}

function loadInventory(): InventoryItem[] {
  try {
    const raw = window.localStorage.getItem("bepflowai-inventory");
    return raw ? (JSON.parse(raw) as InventoryItem[]) : [];
  } catch {
    return [];
  }
}

function loadMealPlan(): MealPlanEntry[] {
  try {
    const raw = window.localStorage.getItem("bepflowai-meal-plan");
    return raw ? (JSON.parse(raw) as MealPlanEntry[]) : [];
  } catch {
    return [];
  }
}

async function fetchSpoonacularRecipes(query: string): Promise<Recipe[]> {
  const response = await fetch(apiUrl(`/api/spoonacular-recipes?q=${encodeURIComponent(query)}`));
  if (!response.ok) throw new Error("Spoonacular request failed");
  const data = (await response.json()) as { configured: boolean; recipes: Recipe[] };
  return data.recipes ?? [];
}

async function fetchGooglePlacesRestaurants(query: string, location: UserLocation | null): Promise<Restaurant[]> {
  const params = new URLSearchParams({ q: query });
  if (location) {
    params.set("lat", String(location.lat));
    params.set("lng", String(location.lng));
  }
  const response = await fetch(apiUrl(`/api/places-search?${params.toString()}`));
  const data = (await response.json()) as { configured?: boolean; places?: Restaurant[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Google Places request failed");
  return data.places ?? [];
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
  const [savedRecipes, setSavedRecipes] = useState<SavedRecipe[]>(() => loadSavedRecipes());
  const [savedRestaurants, setSavedRestaurants] = useState<SavedRestaurant[]>(() => loadSavedRestaurants());
  const [inventory, setInventory] = useState<InventoryItem[]>(() => loadInventory());
  const [mealPlan, setMealPlan] = useState<MealPlanEntry[]>(() => loadMealPlan());
  const [libraryMode, setLibraryMode] = useState<"manual" | "link">("manual");
  const [libraryForm, setLibraryForm] = useState<SavedRecipeForm>({
    name: "",
    author: "bepgraph Demo",
    ingredients: "",
    instructions: "",
    link: "",
    tags: "",
  });
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
    window.localStorage.setItem("bepflowai-saved-recipes", JSON.stringify(savedRecipes));
  }, [savedRecipes]);

  useEffect(() => {
    window.localStorage.setItem("bepflowai-saved-restaurants", JSON.stringify(savedRestaurants));
  }, [savedRestaurants]);

  useEffect(() => {
    window.localStorage.setItem("bepflowai-inventory", JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    window.localStorage.setItem("bepflowai-meal-plan", JSON.stringify(mealPlan));
  }, [mealPlan]);

  useEffect(() => {
    void loadRecipes("chicken");
  }, []);

  async function loadRecipes(query = recipeQuery) {
    setLoadingRecipes(true);
    const results = await Promise.allSettled([fetchMealDbRecipes(query), fetchSpoonacularRecipes(query)]);
    const liveRecipes = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    setRecipes(liveRecipes.length ? liveRecipes : demoRecipes);
    setLoadingRecipes(false);
  }

  async function loadRestaurants(query = restaurantQuery, locationOverride?: UserLocation | null) {
    const searchLocation = locationOverride === undefined ? userLocation : locationOverride;
    setLoadingRestaurants(true);
    try {
      const liveRestaurants = await fetchGooglePlacesRestaurants(`${query} restaurants`, searchLocation);
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

  function handleLibrarySave() {
    if (!libraryForm.name.trim()) return;

    const nextRecipe = createSavedRecipe({
      name: libraryForm.name.trim(),
      author: libraryForm.author.trim() || "bepgraph Demo",
      ingredients: libraryForm.ingredients.trim(),
      instructions: libraryForm.instructions.trim(),
      link: libraryForm.link.trim(),
      tags: libraryForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      source: libraryMode === "link" ? "Link" : "Manual",
    });

    setSavedRecipes((current) => [nextRecipe, ...current]);
    setLibraryForm({ name: "", author: "bepgraph Demo", ingredients: "", instructions: "", link: "", tags: "" });
    setLibraryMode("manual");
  }

  function handleSaveRecipe(recipe: Recipe) {
    const alreadySaved = savedRecipes.some((item) => item.name === recipe.name && item.source === "Import");
    if (alreadySaved) return;

    const nextRecipe = createSavedRecipe({
      name: recipe.name,
      author: "bepgraph Demo",
      ingredients: recipe.ingredients.join("\n"),
      instructions: recipe.instructions,
      link: recipe.sourceUrl || "",
      tags: [recipe.cuisine],
      source: "Import",
    });

    setSavedRecipes((current) => [nextRecipe, ...current]);
  }

  function handleSaveRestaurant(restaurant: Restaurant) {
    if (savedRestaurants.some((item) => item.id === restaurant.id)) return;
    setSavedRestaurants((current) => [{ ...restaurant, savedAt: new Date().toISOString() }, ...current]);
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
      let activeLocation = userLocation;
      let contextRestaurants = restaurants;
      const wantsNearbyCafe = /\b(caf[eé]|coffee|espresso|latte)\b/i.test(nextPrompt) && /\b(near|nearest|nearby|closest|around me|work)\b/i.test(nextPrompt);
      if (wantsNearbyCafe) {
        if (!activeLocation && navigator.geolocation) {
          setLocationStatus("Chat is requesting your location for nearby cafés...");
          activeLocation = await new Promise<UserLocation | null>((resolve) => {
            navigator.geolocation.getCurrentPosition(
              (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
              () => resolve(null),
              { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
            );
          });
          if (activeLocation) {
            setUserLocation(activeLocation);
            setLocationStatus("Location enabled by Chat with Agents");
          } else {
            setLocationStatus("Location unavailable. Café search is using the default area.");
          }
        }
        const cafeResults = await fetchGooglePlacesRestaurants("cafes", activeLocation);
        contextRestaurants = cafeResults;
        if (cafeResults.length) {
          setRestaurants(cafeResults);
          setRestaurantQuery("Cafe");
        }
      }

      const nextDecision = buildDecision(nextPrompt, memory, contextRestaurants, recipes);
      const nextAgents = buildAgents(nextPrompt, memory, nextDecision, contextRestaurants, recipes);
      const rankedRestaurants = rankRestaurants(contextRestaurants, memory).slice(0, 6);
      const rankedRecipes = rankRecipes(recipes, memory).slice(0, 6);
      const response = await fetch(apiUrl("/api/qwen-chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          userContext: inferContext(nextPrompt),
          location: activeLocation ? { enabled: true, latitude: activeLocation.lat, longitude: activeLocation.lng } : { enabled: false, fallbackArea: "San Francisco" },
          memory,
          inventory: inventory.slice(0, 50),
          mealPlan,
          library: savedRecipes.slice(0, 20).map((recipe) => ({
            name: recipe.name,
            author: recipe.author,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            tags: recipe.tags,
            source: recipe.source,
            sourceUrl: recipe.link,
            savedAt: recipe.savedAt,
            substitutionNotes: recipe.substitutionNotes || "",
          })),
          favoriteRestaurants: savedRestaurants.slice(0, 30),
          restaurants: rankedRestaurants,
          recipes: rankedRecipes,
          decision: nextDecision,
          agents: nextAgents,
          selectionPolicy: {
            restaurantSource: "Google Places candidates when available; demo candidates otherwise",
            recipeSource: "TheMealDB and Spoonacular candidates when available; demo candidates otherwise",
            librarySource: "The user's 20 most recently saved local recipes",
            instruction: "Answer the user's direct request. For nearby cafés or restaurants, choose only from the freshly retrieved Google Places candidates. For meal-plan questions, summarize the provided mealPlan. Never invent missing places or meals.",
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
                { id: "inventory", label: "Inventory", icon: Package },
                { id: "planner", label: "Meal Planner", icon: CalendarDays },
                { id: "library", label: "Library", icon: BookOpen },
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
                onSaveRestaurant={handleSaveRestaurant}
              />
            )}
            {tab === "recipes" && (
              <RecipesTab recipes={recipes} query={recipeQuery} loading={loadingRecipes} onQuery={setRecipeQuery} onSearch={loadRecipes} onSaveRecipe={handleSaveRecipe} />
            )}
            {tab === "inventory" && (
              <InventoryTab
                items={inventory}
                recipes={recipes}
                loading={loadingRecipes}
                onAdd={(name, quantity) => setInventory((current) => [{ id: crypto.randomUUID(), name, quantity }, ...current])}
                onRemove={(id) => setInventory((current) => current.filter((item) => item.id !== id))}
                onSearch={loadRecipes}
                onSaveRecipe={handleSaveRecipe}
              />
            )}
            {tab === "planner" && (
              <MealPlannerTab inventory={inventory} recipes={recipes} savedRecipes={savedRecipes} plan={mealPlan} loading={loadingRecipes} onSearch={loadRecipes} onPlanChange={setMealPlan} />
            )}
            {tab === "library" && (
              <LibraryTab
                savedRecipes={savedRecipes}
                savedRestaurants={savedRestaurants}
                mode={libraryMode}
                form={libraryForm}
                onModeChange={setLibraryMode}
                onFormChange={(field, value) => setLibraryForm((current) => ({ ...current, [field]: value }))}
                onSave={() => handleLibrarySave()}
                onRemove={(id) => setSavedRecipes((current) => current.filter((item) => item.id !== id))}
                onUpdateRecipe={(updated) => setSavedRecipes((current) => current.map((item) => item.id === updated.id ? updated : item))}
                onRemoveRestaurant={(id) => setSavedRestaurants((current) => current.filter((item) => item.id !== id))}
              />
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
                restaurants={restaurants}
                mealPlan={mealPlan}
                locationStatus={locationStatus}
                hasLocation={Boolean(userLocation)}
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
  onSaveRestaurant,
}: {
  restaurants: Restaurant[];
  query: string;
  loading: boolean;
  locationStatus: string;
  hasLocation: boolean;
  onQuery: (value: string) => void;
  onSearch: (value?: string, locationOverride?: UserLocation | null) => void;
  onUseLocation: () => void;
  onSaveRestaurant: (restaurant: Restaurant) => void;
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
        <RestaurantMapWindow restaurant={selectedRestaurant} onClose={() => setSelectedRestaurant(null)} onSave={onSaveRestaurant} />
      )}
    </>
  );
}

function RestaurantMapWindow({ restaurant, onClose, onSave }: { restaurant: Restaurant; onClose: () => void; onSave?: (restaurant: Restaurant) => void }) {
  const [saved, setSaved] = useState(false);
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
            {onSave && (
              <button
                type="button"
                disabled={saved}
                onClick={() => { onSave(restaurant); setSaved(true); }}
                className="mt-2 h-11 w-full rounded-lg border border-emerald-600 bg-emerald-50 px-4 text-sm font-black text-emerald-800 disabled:cursor-default"
              >
                {saved ? "Saved to Library" : "Save Restaurant"}
              </button>
            )}
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

function MealPlannerTab({
  inventory,
  recipes,
  savedRecipes,
  plan,
  loading,
  onSearch,
  onPlanChange,
}: {
  inventory: InventoryItem[];
  recipes: Recipe[];
  savedRecipes: SavedRecipe[];
  plan: MealPlanEntry[];
  loading: boolean;
  onSearch: (query?: string) => void;
  onPlanChange: (plan: MealPlanEntry[]) => void;
}) {
  const [showConfigurator, setShowConfigurator] = useState(false);
  const [mealCount, setMealCount] = useState(1);
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [plannerSearch, setPlannerSearch] = useState("");
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const inventoryNames = inventory.map((item) => item.name.toLowerCase().trim()).filter(Boolean);
  const candidates = [
    ...recipes.map((recipe) => ({ id: recipe.id, name: recipe.name, source: recipe.source, ingredients: recipe.ingredients })),
    ...savedRecipes.map((recipe) => ({ id: `saved-${recipe.id}`, name: recipe.name, source: "Library", ingredients: recipe.ingredients.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean) })),
  ];
  const rankedCandidates = candidates
    .map((recipe) => ({
      ...recipe,
      matches: recipe.ingredients.filter((ingredient) => inventoryNames.some((item) => ingredient.toLowerCase().includes(item))).length,
    }))
    .sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name));
  const groceryList = Array.from(new Set(plan.flatMap((meal) => meal.ingredients).filter((ingredient) => !inventoryNames.some((item) => ingredient.toLowerCase().includes(item)))));

  useEffect(() => {
    if (showConfigurator) {
      setSelectedRecipeIds(rankedCandidates.slice(0, mealCount).map((recipe) => recipe.id));
    }
  }, [recipes]);

  function openConfigurator() {
    if (!rankedCandidates.length) return;
    const nextCount = Math.min(plan.length || 7, rankedCandidates.length, 7);
    setMealCount(nextCount);
    setSelectedRecipeIds(rankedCandidates.slice(0, nextCount).map((recipe) => recipe.id));
    setShowConfigurator(true);
  }

  function updateMealCount(nextCount: number) {
    setMealCount(nextCount);
    setSelectedRecipeIds(rankedCandidates.slice(0, nextCount).map((recipe) => recipe.id));
  }

  function toggleRecipe(recipeId: string) {
    setSelectedRecipeIds((current) => current.includes(recipeId)
      ? current.filter((id) => id !== recipeId)
      : current.length < mealCount ? [...current, recipeId] : current);
  }

  function createMealPlan() {
    const selected = rankedCandidates.filter((recipe) => selectedRecipeIds.includes(recipe.id)).slice(0, mealCount);
    if (selected.length !== mealCount) return;
    onPlanChange(selected.map((recipe, index) => {
      const day = days[index];
      return { day, recipeId: recipe.id, recipeName: recipe.name, source: recipe.source, ingredients: recipe.ingredients };
    }));
    setShowConfigurator(false);
  }

  function replaceMeal(index: number) {
    if (!rankedCandidates.length) return;
    const currentId = plan[index]?.recipeId;
    const currentIndex = rankedCandidates.findIndex((recipe) => recipe.id === currentId);
    const recipe = rankedCandidates[(currentIndex + 1 + rankedCandidates.length) % rankedCandidates.length];
    onPlanChange(plan.map((meal, mealIndex) => mealIndex === index ? { ...meal, recipeId: recipe.id, recipeName: recipe.name, source: recipe.source, ingredients: recipe.ingredients } : meal));
  }

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2"><CalendarDays size={23} className="text-emerald-600" /><h2 className="text-2xl font-black">Meal Planner Agent</h2></div>
            <p className="mt-1 text-sm text-slate-500">Build a seven-day plan from live recipes, saved recipes, and your current inventory.</p>
          </div>
          <div className="flex gap-2">
            {plan.length > 0 && <button type="button" onClick={() => onPlanChange([])} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Clear</button>}
            <button type="button" onClick={openConfigurator} disabled={!rankedCandidates.length} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50"><Sparkles size={16} /> Generate New Plan</button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          {plan.length ? plan.map((meal, index) => (
            <article key={meal.day} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-xs font-black text-white">{meal.day.slice(0, 3)}</div>
                <div><h3 className="font-black">{meal.recipeName}</h3><p className="text-sm text-slate-500">{meal.source} · {meal.ingredients.length} ingredients</p></div>
              </div>
              <button type="button" onClick={() => replaceMeal(index)} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:border-emerald-300">Replace meal</button>
            </article>
          )) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">Create a plan after loading recipes or saving recipes to your Library.</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-black">Generated Grocery List</h2><p className="mt-1 text-sm text-slate-500">Ingredients needed for the plan that are not matched by your inventory.</p></div><Badge tone={groceryList.length ? "amber" : "green"}>{groceryList.length} missing</Badge></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {groceryList.length ? groceryList.map((ingredient) => <div key={ingredient} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700"><Plus size={14} className="text-emerald-600" />{ingredient}</div>) : <p className="sm:col-span-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{plan.length ? "Your inventory covers the current plan." : "Create a meal plan to generate its grocery list."}</p>}
        </div>
      </section>
      {showConfigurator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="meal-plan-title">
          <section className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Meal Planner Agent</p><h2 id="meal-plan-title" className="text-xl font-black">Choose recipes for your plan</h2></div>
              <button type="button" onClick={() => setShowConfigurator(false)} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500" aria-label="Close meal planner"><X size={18} /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <label htmlFor="meal-count" className="text-sm font-black text-emerald-900">How many recipes do you want to make?</label>
                <select id="meal-count" value={mealCount} onChange={(event) => updateMealCount(Number(event.target.value))} className="ml-3 h-10 rounded-lg border border-emerald-200 bg-white px-3 text-sm font-bold">
                  {Array.from({ length: Math.min(7, rankedCandidates.length) }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}
                </select>
                <p className="mt-2 text-sm text-emerald-800">Select exactly {mealCount}. The shopping list will combine their ingredients and remove items already in inventory.</p>
              </div>
              <form
                className="mt-4 flex gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (plannerSearch.trim()) onSearch(plannerSearch.trim());
                }}
              >
                <div className="relative min-w-0 flex-1">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={plannerSearch} onChange={(event) => setPlannerSearch(event.target.value)} placeholder="Search for chicken, ramen, tacos..." className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-500" />
                </div>
                <button type="submit" disabled={loading || !plannerSearch.trim()} className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-50">{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search</button>
              </form>
              <p className="mt-2 text-xs text-slate-500">Click a result to select or deselect it. New searches replace the live provider candidates but keep Library recipes available.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rankedCandidates.slice(0, 20).map((recipe) => {
                  const selected = selectedRecipeIds.includes(recipe.id);
                  const coverage = recipe.ingredients.length ? Math.round((recipe.matches / recipe.ingredients.length) * 100) : 0;
                  return (
                    <button key={recipe.id} type="button" onClick={() => toggleRecipe(recipe.id)} className={`text-left rounded-lg border p-4 transition ${selected ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-emerald-300"}`} aria-pressed={selected}>
                      <div className="flex items-start justify-between gap-3"><div><h3 className="font-black">{recipe.name}</h3><p className="mt-1 text-sm text-slate-500">{recipe.source} · {recipe.ingredients.length} ingredients</p></div><div className={`flex h-6 w-6 flex-none items-center justify-center rounded-md border ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300"}`}>{selected && <Check size={14} />}</div></div>
                      <p className="mt-3 text-xs font-bold text-emerald-700">{coverage}% covered by inventory</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <p className="text-sm text-slate-500">{selectedRecipeIds.length} of {mealCount} selected</p>
              <div className="flex gap-2"><button type="button" onClick={() => setShowConfigurator(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold">Cancel</button><button type="button" onClick={createMealPlan} disabled={selectedRecipeIds.length !== mealCount} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-50">Add to Planner</button></div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function InventoryTab({
  items,
  recipes,
  loading,
  onAdd,
  onRemove,
  onSearch,
  onSaveRecipe,
}: {
  items: InventoryItem[];
  recipes: Recipe[];
  loading: boolean;
  onAdd: (name: string, quantity: string) => void;
  onRemove: (id: string) => void;
  onSearch: (query?: string) => void;
  onSaveRecipe: (recipe: Recipe) => void;
}) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const inventoryNames = items.map((item) => item.name.trim().toLowerCase()).filter(Boolean);
  const rankedRecommendations = recipes
    .map((recipe) => {
      const matched = recipe.ingredients.filter((ingredient) => inventoryNames.some((item) => ingredient.toLowerCase().includes(item)));
      const missing = recipe.ingredients.filter((ingredient) => !inventoryNames.some((item) => ingredient.toLowerCase().includes(item)));
      const coverage = recipe.ingredients.length ? Math.round((matched.length / recipe.ingredients.length) * 100) : 0;
      return { recipe, matched, missing, coverage };
    })
    .sort((a, b) => b.coverage - a.coverage || b.matched.length - a.matched.length);
  const preferredRecommendations = [
    ...rankedRecommendations.filter(({ recipe }) => recipe.source === "Spoonacular").slice(0, 3),
    ...rankedRecommendations.filter(({ recipe }) => recipe.source === "TheMealDB").slice(0, 3),
  ];
  const preferredIds = new Set(preferredRecommendations.map(({ recipe }) => recipe.id));
  const recommendations = [
    ...preferredRecommendations.sort((a, b) => b.coverage - a.coverage || b.matched.length - a.matched.length),
    ...rankedRecommendations.filter(({ recipe }) => !preferredIds.has(recipe.id)),
  ]
    .slice(0, 6);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedRecipe(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Package className="text-emerald-600" size={22} />
              <h2 className="text-2xl font-black tracking-tight">Inventory Agent</h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">Track what you have, retrieve recipes, and rank them by ingredient coverage.</p>
          </div>
          <Badge tone={items.length ? "green" : "amber"}>{items.length} pantry {items.length === 1 ? "item" : "items"}</Badge>
        </div>

        <form
          className="mt-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onAdd(name.trim(), quantity.trim() || "1 item");
            setName("");
            setQuantity("");
          }}
        >
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ingredient, e.g. chicken" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          <input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Quantity, e.g. 2 lb" className="h-11 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white hover:bg-slate-800"><Plus size={16} /> Add item</button>
        </form>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.length ? items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black capitalize">{item.name}</p>
                <p className="truncate text-xs text-slate-500">{item.quantity}</p>
              </div>
              <button type="button" onClick={() => onRemove(item.id)} className="flex h-8 w-8 flex-none items-center justify-center rounded-md text-rose-600 hover:bg-rose-50" aria-label={`Remove ${item.name}`}><Trash2 size={15} /></button>
            </div>
          )) : (
            <div className="sm:col-span-2 lg:col-span-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">Add pantry or refrigerator items to start matching recipes.</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-black">Inventory Recommendations</h3>
            <p className="text-sm text-slate-500">Search TheMealDB and Spoonacular, then let the Inventory Agent rank the retrieved recipes.</p>
          </div>
          <form className="flex w-full max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); onSearch(recipeSearch.trim() || items[0]?.name || "quick dinner"); }}>
            <input value={recipeSearch} onChange={(event) => setRecipeSearch(event.target.value)} placeholder={items[0] ? `Try ${items[0].name}` : "Search recipes"} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" />
            <button type="submit" disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white disabled:opacity-60">{loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find recipes</button>
          </form>
        </div>

        <div className="mt-5 space-y-3">
          {recommendations.map(({ recipe, matched, missing, coverage }) => (
            <article key={recipe.id} className="grid overflow-hidden rounded-lg border border-slate-200 sm:grid-cols-[150px_1fr]">
              <img src={recipe.image} alt={recipe.name} className="h-40 w-full object-cover sm:h-full" />
              <div className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Badge tone={coverage >= 50 ? "green" : coverage ? "blue" : "slate"}>{coverage}% inventory match</Badge>
                    <h4 className="mt-2 text-base font-black">{recipe.name}</h4>
                    <p className="text-sm text-slate-500">{recipe.cuisine} · {recipe.time} · {recipe.source}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedRecipe(recipe)} className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white">View recipe</button>
                </div>
                <p className="mt-3 text-sm text-emerald-700"><strong>Have:</strong> {matched.length ? matched.slice(0, 4).join(", ") : "No ingredient matches yet"}</p>
                <p className="mt-1 text-sm text-slate-500"><strong>Still need:</strong> {missing.length ? missing.slice(0, 4).join(", ") : "Nothing — ready to cook"}{missing.length > 4 ? ` +${missing.length - 4} more` : ""}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedRecipe && <RecipeDetailWindow recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} onSave={onSaveRecipe} />}
    </>
  );
}

function RecipesTab({
  recipes,
  query,
  loading,
  onQuery,
  onSearch,
  onSaveRecipe,
}: {
  recipes: Recipe[];
  query: string;
  loading: boolean;
  onQuery: (value: string) => void;
  onSearch: (value?: string) => void;
  onSaveRecipe: (recipe: Recipe) => void;
}) {
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const recipesPerPage = 6;
  const pageCount = Math.max(1, Math.ceil(recipes.length / recipesPerPage));
  const visibleRecipes = recipes.slice((page - 1) * recipesPerPage, page * recipesPerPage);

  useEffect(() => {
    setPage(1);
  }, [recipes]);

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
        subtitle="Recipe Agent merges TheMealDB and Spoonacular results, then scores them against memory, time, and available ingredients."
        query={query}
        loading={loading}
        placeholder="chicken, pasta, curry..."
        onQuery={onQuery}
        onSearch={onSearch}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black">Recipe Candidates</h3>
            <p className="text-sm text-slate-500">
              {recipes.length} recipe {recipes.length === 1 ? "candidate" : "candidates"} found for “{query}”.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-slate-200 p-1" aria-label="Recipe view">
              <button type="button" onClick={() => setViewMode("grid")} className={`flex h-8 items-center gap-2 rounded-md px-3 text-xs font-bold ${viewMode === "grid" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`} aria-pressed={viewMode === "grid"}>
                <LayoutGrid size={14} /> Grid
              </button>
              <button type="button" onClick={() => setViewMode("list")} className={`flex h-8 items-center gap-2 rounded-md px-3 text-xs font-bold ${viewMode === "list" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`} aria-pressed={viewMode === "list"}>
                <List size={14} /> List
              </button>
            </div>
            <Badge tone={recipes.some((item) => item.source !== "Demo") ? "green" : "amber"}>
              <ExternalLink size={13} />
              {recipes.some((item) => item.source === "Spoonacular")
                ? "TheMealDB + Spoonacular live"
                : recipes.some((item) => item.source === "TheMealDB") ? "TheMealDB live" : "Demo fallback"}
            </Badge>
          </div>
        </div>
        <div className={viewMode === "grid" ? "grid grid-cols-1 gap-4 md:grid-cols-3" : "space-y-3"}>
          {visibleRecipes.map((recipe) => (
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
              className={`overflow-hidden rounded-lg border border-slate-200 transition hover:-translate-y-0.5 hover:cursor-pointer hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500 ${viewMode === "list" ? "grid sm:grid-cols-[180px_1fr]" : ""}`}
            >
              <div className={viewMode === "list" ? "h-44 bg-slate-100 sm:h-full" : "h-40 bg-slate-100"}>
                <img src={recipe.image} alt={recipe.name} className="h-full w-full object-cover" />
              </div>
              <div className="p-4">
                <Badge tone={recipe.source === "Demo" ? "slate" : "green"}>{recipe.source}</Badge>
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
        {pageCount > 1 && (
          <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4" aria-label="Recipe pages">
            <p className="text-sm text-slate-500">Page {page} of {pageCount} · showing {(page - 1) * recipesPerPage + 1}–{Math.min(page * recipesPerPage, recipes.length)} of {recipes.length}</p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => (
                <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-3 text-sm font-black ${page === pageNumber ? "bg-emerald-600 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`} aria-current={page === pageNumber ? "page" : undefined}>
                  {pageNumber}
                </button>
              ))}
            </div>
          </nav>
        )}
      </section>
      {selectedRecipe && (
        <RecipeDetailWindow recipe={selectedRecipe} onClose={() => setSelectedRecipe(null)} onSave={onSaveRecipe} />
      )}
    </>
  );
}

function RecipeDetailWindow({ recipe, onClose, onSave }: { recipe: Recipe; onClose: () => void; onSave?: (recipe: Recipe) => void }) {
  const [saved, setSaved] = useState(false);
  const steps = recipe.instructions
    .split(/\r?\n+/)
    .map((step) => step.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      {saved && (
        <div className="fixed right-4 top-4 z-[60] flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-xl" role="status" aria-live="polite">
          <Check size={17} /> Saved to Library
        </div>
      )}
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
              <Badge tone={recipe.source === "Demo" ? "slate" : "green"}>{recipe.source}</Badge>
            </div>
            <div className="mt-5">
              <h3 className="text-base font-black">Ingredients</h3>
              {recipe.ingredients.length ? (
                <ul className="mt-3 space-y-2">
                  {recipe.ingredients.map((ingredient, index) => (
                    <li key={`${ingredient}-${index}`} className="flex gap-2 text-sm leading-6 text-slate-700">
                      <span className="font-black text-emerald-600">•</span>
                      <span>{ingredient}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No ingredients are available for this recipe.</p>
              )}
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
          {recipe.sourceUrl ? (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-900">
              <ExternalLink size={15} /> Original recipe
            </a>
          ) : (
            <p className="text-sm text-slate-500">Use Escape, Close, or Done Cooking to exit this recipe.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {onSave && (
              <button
                onClick={() => {
                  onSave(recipe);
                  setSaved(true);
                }}
                disabled={saved}
                className="h-10 rounded-lg border border-emerald-600 bg-emerald-50 px-4 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
              >
                {saved ? "Saved to Library" : "Save to Library"}
              </button>
            )}
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

function LibraryTab({
  savedRecipes,
  savedRestaurants,
  mode,
  form,
  onModeChange,
  onFormChange,
  onSave,
  onRemove,
  onUpdateRecipe,
  onRemoveRestaurant,
}: {
  savedRecipes: SavedRecipe[];
  savedRestaurants: SavedRestaurant[];
  mode: "manual" | "link";
  form: {
    name: string;
    author: string;
    ingredients: string;
    instructions: string;
    link: string;
    tags: string;
  };
  onModeChange: (mode: "manual" | "link") => void;
  onFormChange: (field: keyof SavedRecipeForm, value: string) => void;
  onSave: () => void;
  onRemove: (id: string) => void;
  onUpdateRecipe: (recipe: SavedRecipe) => void;
  onRemoveRestaurant: (id: string) => void;
}) {
  const [selectedRecipe, setSelectedRecipe] = useState<SavedRecipe | null>(null);
  const [selectedRestaurant, setSelectedRestaurant] = useState<SavedRestaurant | null>(null);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedRecipe(null);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Personal Library</h2>
            <p className="mt-1 text-sm text-slate-500">Save recipes, jot down ideas, and keep a recreational recipe notebook in one place.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onModeChange("manual")}
              className={`h-10 rounded-lg px-4 text-sm font-bold ${mode === "manual" ? "bg-slate-950 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              Manual
            </button>
            <button
              onClick={() => onModeChange("link")}
              className={`h-10 rounded-lg px-4 text-sm font-bold ${mode === "link" ? "bg-slate-950 text-white" : "border border-slate-200 text-slate-700 hover:bg-slate-50"}`}
            >
              From link
            </button>
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
          className="mt-5 grid gap-5 lg:grid-cols-[1fr_380px]"
        >
          <div className="space-y-5 rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
            <div className="h-1 w-16 rounded-full bg-slate-300" />
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-slate-700">Recipe name</label>
                <input
                  value={form.name}
                  onChange={(event) => onFormChange("name", event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Ginger Tofu Rice Bowl"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">Author</label>
                <input
                  value={form.author}
                  onChange={(event) => onFormChange("author", event.target.value)}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="bepgraph Demo"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">Ingredients</label>
                <textarea
                  value={form.ingredients}
                  onChange={(event) => onFormChange("ingredients", event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="tofu, rice, ginger, garlic, spinach, soy sauce"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-700">Recipe steps</label>
                <textarea
                  value={form.instructions}
                  onChange={(event) => onFormChange("instructions", event.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  placeholder="Cook rice. Sear tofu with ginger and garlic. Wilt spinach. Finish with soy sauce and serve over rice."
                />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-bold text-slate-700">Recipe link</label>
                  <input
                    value={form.link}
                    onChange={(event) => onFormChange("link", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    placeholder="https://example.com/ginger-tofu-rice-bowl"
                  />
                </div>
                <div>
                  <label className="text-sm font-bold text-slate-700">Tags</label>
                  <input
                    value={form.tags}
                    onChange={(event) => onFormChange("tags", event.target.value)}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    placeholder="tofu, rice, vegan"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800"
                >
                  Save to Library
                </button>
                <p className="text-sm text-slate-500">Your saved recipes are stored locally in the current browser profile.</p>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Recipe notes</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">Keep your recreational cooking ideas, journal entries, and quick recipe notes together.</p>
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm tracking-tight text-slate-700">
                <p className="text-slate-400">• Add ingredients and instructions at the same time, then save the recipe.</p>
                <p className="mt-2 text-slate-400">• Use tags to group by cuisine, meal type, or mood.</p>
                <p className="mt-2 text-slate-400">• Switch to link mode if you want to capture a recipe source URL.</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-500">Recent saved recipes</p>
              <div className="mt-4 space-y-3">
                {savedRecipes.length ? (
                  savedRecipes.map((item) => (
                    <article key={item.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-black">{item.name}</h3>
                          <p className="mt-1 text-sm text-slate-500">by {item.author}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemove(item.id)}
                          className="text-sm font-bold uppercase tracking-[0.18em] text-rose-600 hover:text-rose-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.tags.map((tag) => (
                          <Badge key={`${item.id}-${tag}`} tone="blue">{tag}</Badge>
                        ))}
                      </div>
                      {item.link ? (
                        <a href={item.link} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-bold text-emerald-700 hover:text-emerald-900">
                          View source link
                        </a>
                      ) : null}
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setSelectedRecipe(item)}
                          className="inline-flex h-9 items-center rounded-lg bg-slate-950 px-3 text-xs font-black text-white hover:bg-slate-800"
                        >
                          View recipe
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
                    Your recipe notebook is empty. Save a recipe to start building your personal library.
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xl font-black">Favorite Restaurants</h2>
          <p className="mt-1 text-sm text-slate-500">Keep favorite places and reopen their location details whenever you need them.</p>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {savedRestaurants.length ? savedRestaurants.map((restaurant) => (
            <article key={restaurant.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">{restaurant.name}</h3>
                  <p className="mt-1 text-sm text-slate-500">{restaurant.cuisine} · {restaurant.address}</p>
                </div>
                <Badge tone={restaurant.source === "Google Places" ? "green" : "slate"}>{restaurant.source}</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => setSelectedRestaurant(restaurant)} className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white">View place</button>
                <button type="button" onClick={() => onRemoveRestaurant(restaurant.id)} className="h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50">Remove</button>
              </div>
            </article>
          )) : (
            <div className="md:col-span-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">Open a restaurant from the Restaurants tab and choose Save Restaurant to build your favorites.</div>
          )}
        </div>
      </section>
      {selectedRecipe && (
        <SavedRecipeDetailWindow
          recipe={selectedRecipe}
          onClose={() => setSelectedRecipe(null)}
          onUpdate={(updated) => { onUpdateRecipe(updated); setSelectedRecipe(updated); }}
        />
      )}
      {selectedRestaurant && <RestaurantMapWindow restaurant={selectedRestaurant} onClose={() => setSelectedRestaurant(null)} />}
    </>
  );
}

function SavedRecipeDetailWindow({ recipe, onClose, onUpdate }: { recipe: SavedRecipe; onClose: () => void; onUpdate: (recipe: SavedRecipe) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(recipe);
  const ingredients = recipe.ingredients
    .split(/\r?\n|,/)
    .map((ingredient) => ingredient.trim())
    .filter(Boolean);
  const steps = recipe.instructions
    .split(/\r?\n+/)
    .map((step) => step.trim())
    .filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Saved recipe</p>
            <h2 className="truncate text-xl font-black">{draft.name}</h2>
            <p className="truncate text-sm text-slate-500">by {draft.author}</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Close recipe">
            <X size={18} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[320px_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50 p-5 md:border-b-0 md:border-r">
            <Badge tone={recipe.source === "Import" ? "green" : "slate"}>{recipe.source}</Badge>
            <h3 className="mt-5 text-base font-black">Ingredients</h3>
            {editing ? (
              <textarea value={draft.ingredients} onChange={(event) => setDraft((current) => ({ ...current, ingredients: event.target.value }))} rows={12} className="mt-3 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm outline-none focus:border-emerald-500" />
            ) : ingredients.length ? (
              <ul className="mt-3 space-y-2">
                {ingredients.map((ingredient, index) => (
                  <li key={`${ingredient}-${index}`} className="flex gap-2 text-sm leading-6 text-slate-700">
                    <span className="font-black text-emerald-600">•</span>
                    <span>{ingredient}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">No ingredients were added.</p>
            )}
            {recipe.tags.length ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {recipe.tags.map((tag) => <Badge key={tag} tone="blue">{tag}</Badge>)}
              </div>
            ) : null}
          </aside>

          <div className="p-5">
            <div className="mb-5 rounded-lg border border-emerald-100 bg-emerald-50 p-4">
              <h3 className="text-sm font-black text-emerald-900">Cook mode</h3>
              <p className="mt-1 text-sm leading-6 text-emerald-800">Keep this window open while cooking, then press Done Cooking when you finish.</p>
            </div>
            {editing && (
              <div className="mb-5 grid gap-3 sm:grid-cols-2">
                <div><label className="text-sm font-bold">Recipe name</label><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" /></div>
                <div><label className="text-sm font-bold">Author</label><input value={draft.author} onChange={(event) => setDraft((current) => ({ ...current, author: event.target.value }))} className="mt-2 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-emerald-500" /></div>
              </div>
            )}
            <h3 className="text-base font-black">Instructions</h3>
            {editing ? (
              <textarea value={draft.instructions} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} rows={10} className="mt-3 w-full rounded-lg border border-slate-200 p-3 text-sm leading-6 outline-none focus:border-emerald-500" />
            ) : (
              <div className="mt-3 space-y-3">
                {(steps.length ? steps : ["No instructions were added."]).map((step, index) => (
                  <div key={`${step}-${index}`} className="flex gap-3 rounded-lg border border-slate-200 p-3">
                    <div className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-slate-950 text-xs font-black text-white">{index + 1}</div>
                    <p className="text-sm leading-6 text-slate-700">{step}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-black text-amber-900">Substitution notes</h3>
              {editing ? (
                <textarea value={draft.substitutionNotes || ""} onChange={(event) => setDraft((current) => ({ ...current, substitutionNotes: event.target.value }))} rows={4} placeholder="Example: Replace dairy milk with oat milk; use sunflower seed butter for a nut-free version." className="mt-2 w-full rounded-lg border border-amber-200 bg-white p-3 text-sm outline-none focus:border-amber-500" />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-900">{recipe.substitutionNotes || "No substitution notes yet. Choose Edit Recipe to add options for dietary needs or available ingredients."}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
          <div>
            {recipe.link ? (
              <a href={recipe.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700 hover:text-emerald-900">
                <ExternalLink size={15} /> View source
              </a>
            ) : <p className="text-sm text-slate-500">Saved in your personal library.</p>}
          </div>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button type="button" onClick={() => { setDraft(recipe); setEditing(false); }} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancel</button>
                <button type="button" onClick={() => { onUpdate(draft); setEditing(false); }} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white">Save Changes</button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="h-10 rounded-lg border border-emerald-600 bg-emerald-50 px-4 text-sm font-bold text-emerald-800">Edit Recipe</button>
            )}
            <button type="button" onClick={onClose} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Close</button>
            <button type="button" onClick={onClose} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-black text-white hover:bg-emerald-700">Done Cooking</button>
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
  restaurants,
  mealPlan,
  locationStatus,
  hasLocation,
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
  restaurants: Restaurant[];
  mealPlan: MealPlanEntry[];
  locationStatus: string;
  hasLocation: boolean;
  onPrompt: (value: string) => void;
  onRun: (value?: string) => void;
  onRate: (score: number) => void;
}) {
  const directContextRequest = /\b(caf[eé]|coffee|meal plan|planned meals|nearest|nearby)\b/i.test(submitted);
  return (
    <>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-950 px-5 py-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight">Chat with Agents</h2>
            <p className="mt-1 text-sm text-slate-300">Ask for nearby places, inspect your meal plan, or coordinate a food decision.</p>
          </div>
          <button
            onClick={() => onRun(prompts[(prompts.indexOf(submitted) + 1) % prompts.length])}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-700 px-3 text-sm font-bold text-slate-200 hover:bg-slate-800"
          >
            <RefreshCcw size={15} />
            Scenario
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => { onPrompt("Find the nearest café where I can work and get a drink."); }} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-emerald-400">Nearby café</button>
          <button type="button" onClick={() => { onPrompt("What meals are currently in my meal plan?"); }} className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-emerald-400">Check my meal plan</button>
        </div>
        <div className="mt-3 flex gap-2">
          <div className="relative flex-1">
            <MessageSquareText className="absolute left-3 top-3 text-slate-500" size={18} />
            <input
              value={prompt}
              onChange={(event) => onPrompt(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && onRun()}
              className="h-12 w-full rounded-lg border border-slate-700 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none ring-emerald-500 focus:ring-2"
              placeholder="Ask for a nearby café or check your saved meal plan..."
            />
          </div>
          <button onClick={() => onRun()} className="inline-flex h-12 items-center gap-2 rounded-lg bg-emerald-500 px-5 text-sm font-black text-slate-950 hover:bg-emerald-400">
            <Send size={16} />
            Run
          </button>
        </div>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Navigation size={14} />Location</div><p className="mt-2 text-sm font-bold text-slate-800">{hasLocation ? "Enabled for nearby searches" : "Requested when a nearby search runs"}</p><p className="mt-1 text-xs text-slate-500">{locationStatus}</p></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><Store size={14} />Places context</div><p className="mt-2 text-sm font-bold text-slate-800">{restaurants.filter((item) => item.source === "Google Places").length} live candidates</p><p className="mt-1 text-xs text-slate-500">Chat refreshes this list for café requests.</p></div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500"><CalendarDays size={14} />Meal plan</div><p className="mt-2 text-sm font-bold text-slate-800">{mealPlan.length ? `${mealPlan.length} planned meals` : "No plan saved"}</p><p className="mt-1 truncate text-xs text-slate-500">{mealPlan.length ? mealPlan.map((meal) => meal.recipeName).join(", ") : "Generate one in Meal Planner."}</p></div>
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
          {running && <p className="text-sm leading-6 text-slate-600">Qwen is coordinating live Places, Meal Planner, Inventory, Memory, Recipe, Budget, and Decision context...</p>}
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

      {!directContextRequest && <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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
      </section>}

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
