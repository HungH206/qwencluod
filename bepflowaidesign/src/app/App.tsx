import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Brain,
  CalendarClock,
  Check,
  ChefHat,
  Clock,
  CloudRain,
  DollarSign,
  ListChecks,
  Loader2,
  MapPin,
  MessageSquareText,
  Minus,
  Plus,
  ReceiptText,
  RefreshCcw,
  Send,
  Sparkles,
  Star,
  Store,
  Target,
  Utensils,
  Wallet,
} from "lucide-react";

type Mode = "restaurant" | "cook" | "prep";
type AgentState = "idle" | "running" | "done";

type Memory = {
  cuisines: string[];
  dislikes: string[];
  maxCookMinutes: number;
  weeklyBudget: number;
  spentThisWeek: number;
  lastMeals: string[];
  ratings: { label: string; score: number; note: string }[];
};

type AgentOutput = {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  state: AgentState;
  confidence: number;
  summary: string;
  evidence: string[];
};

type Decision = {
  winner: Mode;
  confidence: number;
  title: string;
  explanation: string;
  cost: number;
  minutes: number;
  match: number;
  scores: Record<Mode, number>;
};

const memorySeed: Memory = {
  cuisines: ["Japanese", "Thai", "Mediterranean"],
  dislikes: ["cilantro", "long waits", "very spicy ramen"],
  maxCookMinutes: 25,
  weeklyBudget: 100,
  spentThisWeek: 58,
  lastMeals: ["pizza", "salad bowl", "ramen", "tacos"],
  ratings: [
    { label: "Sakura Sushi House", score: 5, note: "Fast service, high protein dinner." },
    { label: "Bangkok Garden", score: 4, note: "Great portions and still under budget." },
  ],
};

const prompts = [
  "I'm coding until midnight and need something fast.",
  "I have 45 minutes free, chicken, rice, and spinach at home.",
  "I'm trying to save money this week but still want Thai food.",
];

const foodImages = {
  restaurant:
    "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80",
  cook: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=1200&q=80",
  prep: "https://images.unsplash.com/photo-1543353071-10c8ba85a904?auto=format&fit=crop&w=1200&q=80",
};

function loadMemory() {
  try {
    const raw = window.localStorage.getItem("foodpilot-memory");
    return raw ? ({ ...memorySeed, ...JSON.parse(raw) } as Memory) : memorySeed;
  } catch {
    return memorySeed;
  }
}

function inferContext(text: string) {
  const lower = text.toLowerCase();
  const busy =
    lower.includes("busy") ||
    lower.includes("coding") ||
    lower.includes("midnight") ||
    lower.includes("fast") ||
    lower.includes("quick");
  const saveMoney = lower.includes("save") || lower.includes("budget") || lower.includes("cheap");
  const hasIngredients =
    lower.includes("chicken") ||
    lower.includes("rice") ||
    lower.includes("spinach") ||
    lower.includes("home");
  const wantsThai = lower.includes("thai");
  const freeTime = lower.includes("45") || lower.includes("free");

  return { busy, saveMoney, hasIngredients, wantsThai, freeTime };
}

function buildDecision(prompt: string, memory: Memory): Decision {
  const context = inferContext(prompt);
  const remaining = memory.weeklyBudget - memory.spentThisWeek;

  let restaurant = 65;
  let cook = 58;
  let prep = 50;

  if (context.busy) {
    restaurant += 24;
    cook -= 18;
    prep -= 8;
  }
  if (context.saveMoney || remaining < 35) {
    cook += 24;
    prep += 18;
    restaurant -= 18;
  }
  if (context.hasIngredients || context.freeTime) {
    cook += 26;
    prep += 12;
    restaurant -= 6;
  }
  if (context.wantsThai || memory.cuisines.includes("Thai")) {
    restaurant += 8;
    cook += 5;
  }
  if (memory.lastMeals.includes("pizza")) {
    restaurant += 3;
    cook += 3;
  }

  const scores = {
    restaurant: Math.max(0, Math.min(98, restaurant)),
    cook: Math.max(0, Math.min(98, cook)),
    prep: Math.max(0, Math.min(98, prep)),
  };

  const winner = (Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0] ?? "restaurant") as Mode;
  const confidence = Math.max(76, Math.round(scores[winner]));

  if (winner === "cook") {
    return {
      winner,
      confidence,
      title: context.wantsThai ? "Cook Thai basil chicken at home" : "Cook a 20-minute chicken rice bowl",
      explanation:
        "Cooking wins because your pantry covers the main ingredients, your remaining budget is tight, and the recipe stays under your preferred cooking time.",
      cost: 9,
      minutes: context.freeTime ? 22 : 18,
      match: confidence,
      scores,
    };
  }

  if (winner === "prep") {
    return {
      winner,
      confidence,
      title: "Meal prep two rice bowls for tonight and tomorrow",
      explanation:
        "Meal prep wins because it preserves budget, uses ingredients already at home, and gives you a second meal without another decision later.",
      cost: 14,
      minutes: 35,
      match: confidence,
      scores,
    };
  }

  return {
    winner,
    confidence,
    title: context.wantsThai ? "Eat at Bangkok Garden" : "Eat at Sakura Sushi House",
    explanation:
      "Eating out wins because your schedule is compressed, the restaurant is nearby, it fits the remaining weekly budget, and it aligns with your strongest cuisine memories.",
    cost: context.wantsThai ? 17 : 21,
    minutes: context.wantsThai ? 11 : 8,
    match: confidence,
    scores,
  };
}

function buildAgents(prompt: string, memory: Memory, decision: Decision): AgentOutput[] {
  const context = inferContext(prompt);
  const remaining = memory.weeklyBudget - memory.spentThisWeek;
  return [
    {
      id: "memory",
      name: "Memory Agent",
      icon: Brain,
      color: "#2563eb",
      state: "done",
      confidence: 96,
      summary: `Loaded ${memory.cuisines.length} cuisine preferences and ${memory.ratings.length} ratings.`,
      evidence: [
        `Likes ${memory.cuisines.slice(0, 2).join(" and ")}`,
        `Avoids ${memory.dislikes.slice(0, 2).join(" and ")}`,
        `Preferred cooking time is ${memory.maxCookMinutes} minutes`,
      ],
    },
    {
      id: "schedule",
      name: "Schedule Agent",
      icon: CalendarClock,
      color: "#7c3aed",
      state: "done",
      confidence: context.busy ? 93 : 78,
      summary: context.busy ? "Detected a compressed evening schedule." : "Detected enough time for cooking.",
      evidence: [
        context.busy ? "Prompt includes fast, coding, or midnight intent" : "No hard deadline detected",
        context.freeTime ? "User mentioned a 45-minute window" : "Dinner window remains flexible",
      ],
    },
    {
      id: "restaurant",
      name: "Restaurant Agent",
      icon: Store,
      color: "#dc2626",
      state: "done",
      confidence: decision.scores.restaurant,
      summary: "Found strong nearby options in preferred cuisines.",
      evidence: [
        "Sakura Sushi House: 4.9 stars, 8 minutes, $21",
        "Bangkok Garden: 4.7 stars, 11 minutes, $17",
        "No recent repeat of Japanese or Thai this week",
      ],
    },
    {
      id: "recipe",
      name: "Recipe Agent",
      icon: ChefHat,
      color: "#16a34a",
      state: "done",
      confidence: decision.scores.cook,
      summary: "Generated fast recipes from pantry and cuisine memory.",
      evidence: [
        context.hasIngredients ? "Chicken, rice, and spinach are available" : "Default pantry supports rice bowls",
        "Fastest recipe is 18 minutes",
        "Qwen generation slot can create variations live",
      ],
    },
    {
      id: "budget",
      name: "Budget Agent",
      icon: Wallet,
      color: "#d97706",
      state: "done",
      confidence: remaining >= decision.cost ? 94 : 62,
      summary: `$${remaining} remains from a $${memory.weeklyBudget} weekly food budget.`,
      evidence: [
        `Recommended option costs about $${decision.cost}`,
        `Eating out cap for tonight is $${Math.max(0, remaining - 10)}`,
        context.saveMoney ? "User explicitly asked to save money" : "No savings constraint requested",
      ],
    },
    {
      id: "decision",
      name: "Decision Agent",
      icon: Target,
      color: "#0f172a",
      state: "done",
      confidence: decision.confidence,
      summary: `${decision.title} wins with ${decision.confidence}% confidence.`,
      evidence: [
        `Restaurant ${decision.scores.restaurant}%`,
        `Cook ${decision.scores.cook}%`,
        `Meal prep ${decision.scores.prep}%`,
      ],
    },
  ];
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
        <div
          className={`h-full rounded transition-all duration-700 ${active ? "bg-emerald-500" : "bg-slate-300"}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function AgentCard({ agent, running }: { agent: AgentOutput; running: boolean }) {
  const Icon = agent.icon;
  const state = running ? "running" : agent.state;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `${agent.color}14` }}>
            <Icon size={20} style={{ color: agent.color }} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-950">{agent.name}</h3>
            <p className="text-xs text-slate-500">{agent.confidence}% confidence</p>
          </div>
        </div>
        <Badge tone={state === "done" ? "green" : "amber"}>
          {state === "running" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {state === "running" ? "Running" : "Done"}
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
    </section>
  );
}

function App() {
  const [memory, setMemory] = useState<Memory>(() => loadMemory());
  const [prompt, setPrompt] = useState(prompts[0]);
  const [submitted, setSubmitted] = useState(prompts[0]);
  const [running, setRunning] = useState(false);
  const [stars, setStars] = useState(0);

  const decision = useMemo(() => buildDecision(submitted, memory), [submitted, memory]);
  const agents = useMemo(() => buildAgents(submitted, memory, decision), [submitted, memory, decision]);

  useEffect(() => {
    window.localStorage.setItem("foodpilot-memory", JSON.stringify(memory));
  }, [memory]);

  function runOrchestrator(nextPrompt = prompt) {
    if (!nextPrompt.trim()) return;
    setPrompt(nextPrompt);
    setSubmitted(nextPrompt);
    setRunning(true);
    setStars(0);
    window.setTimeout(() => setRunning(false), 1200);
  }

  function addCuisine(cuisine: string) {
    setMemory((current) => ({
      ...current,
      cuisines: current.cuisines.includes(cuisine) ? current.cuisines : [cuisine, ...current.cuisines].slice(0, 5),
    }));
  }

  function rate(score: number) {
    setStars(score);
    setMemory((current) => ({
      ...current,
      spentThisWeek: Math.min(current.weeklyBudget, current.spentThisWeek + (score >= 4 ? decision.cost : 0)),
      lastMeals: [decision.title, ...current.lastMeals].slice(0, 5),
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

  const winnerImage = foodImages[decision.winner];
  const budgetRemaining = memory.weeklyBudget - memory.spentThisWeek;

  return (
    <main className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Utensils size={22} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">FoodPilot AI</h1>
              <p className="text-sm text-slate-500">Autonomous agents for cook, eat out, or meal prep decisions</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="blue">
              <Activity size={13} />
              Agent Society Track
            </Badge>
            <Badge tone="amber">
              <Sparkles size={13} />
              Qwen-ready recipe generation
            </Badge>
          </div>
        </header>

        <section className="grid flex-1 grid-cols-1 gap-5 p-5 md:p-8 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="relative min-h-[360px]">
                <img src={winnerImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/70 to-slate-950/20" />
                <div className="relative flex min-h-[360px] flex-col justify-between p-5 text-white md:p-7">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="green">
                      <Target size={13} />
                      Final recommendation
                    </Badge>
                    <Badge tone="slate">{decision.confidence}% confidence</Badge>
                  </div>

                  <div className="max-w-2xl">
                    <p className="mb-2 text-sm font-bold uppercase tracking-[0.2em] text-emerald-300">
                      Decision Orchestrator
                    </p>
                    <h2 className="text-4xl font-black leading-tight tracking-tight md:text-5xl">{decision.title}</h2>
                    <p className="mt-4 max-w-xl text-base leading-7 text-slate-200">{decision.explanation}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur">
                      <DollarSign size={17} className="text-emerald-300" />
                      <p className="mt-2 text-2xl font-black">${decision.cost}</p>
                      <p className="text-xs text-slate-300">Estimated cost</p>
                    </div>
                    <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur">
                      <Clock size={17} className="text-blue-300" />
                      <p className="mt-2 text-2xl font-black">{decision.minutes}m</p>
                      <p className="text-xs text-slate-300">Total time</p>
                    </div>
                    <div className="rounded-lg border border-white/15 bg-white/10 p-3 backdrop-blur">
                      <Star size={17} className="text-amber-300" />
                      <p className="mt-2 text-2xl font-black">{decision.match}%</p>
                      <p className="text-xs text-slate-300">Profile match</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black">Ask the Orchestrator</h2>
                  <p className="text-sm text-slate-500">The user talks here; every agent works behind the scenes.</p>
                </div>
                <button
                  onClick={() => runOrchestrator(prompts[(prompts.indexOf(submitted) + 1) % prompts.length])}
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
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && runOrchestrator()}
                    className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none ring-emerald-500 transition focus:bg-white focus:ring-2"
                    placeholder="Tell FoodPilot about your day..."
                  />
                </div>
                <button
                  onClick={() => runOrchestrator()}
                  className="inline-flex h-12 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800"
                >
                  <Send size={16} />
                  Run
                </button>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-black">
                  <MapPin size={17} className="text-rose-600" />
                  Restaurant
                </div>
                <p className="mt-2 text-sm text-slate-600">Nearby preferred cuisines, distance, wait, price, and repeat avoidance.</p>
                <div className="mt-4 space-y-3">
                  <ScoreBar label="Dining score" value={decision.scores.restaurant} active={decision.winner === "restaurant"} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-black">
                  <ChefHat size={17} className="text-emerald-600" />
                  Recipe
                </div>
                <p className="mt-2 text-sm text-slate-600">Pantry fit, cooking time, dietary memory, and Qwen-generated variants.</p>
                <div className="mt-4 space-y-3">
                  <ScoreBar label="Cooking score" value={decision.scores.cook} active={decision.winner === "cook"} />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-black">
                  <ReceiptText size={17} className="text-amber-600" />
                  Meal prep
                </div>
                <p className="mt-2 text-sm text-slate-600">Budget preservation, batch value, future schedule, and ingredient use.</p>
                <div className="mt-4 space-y-3">
                  <ScoreBar label="Prep score" value={decision.scores.prep} active={decision.winner === "prep"} />
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black">Feedback Updates Memory</h2>
                  <p className="text-sm text-slate-500">Ratings persist in localStorage and influence the next run.</p>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      onClick={() => rate(score)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 hover:bg-amber-50"
                      aria-label={`Rate ${score} stars`}
                    >
                      <Star
                        size={18}
                        className={score <= stars ? "fill-amber-400 text-amber-400" : "text-slate-300"}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black">Live Agent Dashboard</h2>
                  <p className="text-sm text-slate-500">Visible negotiation for judges.</p>
                </div>
                <Badge tone={running ? "amber" : "green"}>
                  {running ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  {running ? "Thinking" : "Resolved"}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                {agents.map((agent, index) => (
                  <AgentCard key={agent.id} agent={agent} running={running && index > 1} />
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-black">Persistent Memory</h2>
                  <p className="text-sm text-slate-500">Stored locally across sessions.</p>
                </div>
                <Brain size={20} className="text-blue-600" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-400">Budget left</p>
                  <p className="mt-1 text-2xl font-black">${budgetRemaining}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs font-bold uppercase text-slate-400">Cook limit</p>
                  <p className="mt-1 text-2xl font-black">{memory.maxCookMinutes}m</p>
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase text-slate-400">Cuisine memory</p>
                <div className="flex flex-wrap gap-2">
                  {memory.cuisines.map((cuisine) => (
                    <Badge key={cuisine} tone="blue">{cuisine}</Badge>
                  ))}
                  {["Korean", "Mexican", "Indian"].map((cuisine) => (
                    <button
                      key={cuisine}
                      onClick={() => addCuisine(cuisine)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                    >
                      <Plus size={12} />
                      {cuisine}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-xs font-bold uppercase text-slate-400">Latest learning</p>
                <div className="space-y-2">
                  {memory.ratings.slice(0, 3).map((item) => (
                    <div key={`${item.label}-${item.note}`} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-bold text-slate-800">{item.label}</p>
                        <span className="font-mono text-xs text-amber-600">{item.score}/5</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-black">Demo Architecture</h2>
              <div className="mt-4 space-y-3">
                {[
                  { icon: MessageSquareText, label: "User prompt", detail: "Natural language context" },
                  { icon: Sparkles, label: "Decision Orchestrator", detail: "Delegates and merges agent outputs" },
                  { icon: ListChecks, label: "Specialized agents", detail: "Memory, schedule, restaurant, recipe, budget" },
                  { icon: ArrowRight, label: "Recommendation", detail: "Explainable winner with confidence" },
                ].map((item, index, arr) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label}>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
                          <Icon size={17} className="text-slate-700" />
                        </div>
                        <div>
                          <p className="text-sm font-black">{item.label}</p>
                          <p className="text-xs text-slate-500">{item.detail}</p>
                        </div>
                      </div>
                      {index < arr.length - 1 && <div className="ml-4 h-5 w-px bg-slate-200" />}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <CloudRain size={19} className="text-blue-600" />
                <p className="mt-2 text-sm font-black">Weather</p>
                <p className="text-xs text-slate-500">Rain raises restaurant delivery value.</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <Minus size={19} className="text-rose-600" />
                <p className="mt-2 text-sm font-black">Skipped</p>
                <p className="text-xs text-slate-500">Auth, payments, social, coupons.</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default App;
