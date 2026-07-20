export const mealPlannerTools = [
  {
    name: "create_meal_plan",
    description: "Create a seven-day meal plan from ranked recipe candidates.",
    inputSchema: {
      type: "object",
      properties: { recipes: { type: "array" }, inventory: { type: "array" } },
      required: ["recipes", "inventory"],
    },
  },
  {
    name: "replace_meal",
    description: "Replace one day in an existing meal plan with a recipe candidate.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "array" }, day: { type: "string" }, recipe: { type: "object" } },
      required: ["plan", "day", "recipe"],
    },
  },
  {
    name: "build_grocery_list",
    description: "Return planned ingredients not currently represented in inventory.",
    inputSchema: {
      type: "object",
      properties: { plan: { type: "array" }, inventory: { type: "array" } },
      required: ["plan", "inventory"],
    },
  },
];

function inventoryMatch(ingredient, inventoryNames) {
  const normalized = String(ingredient).toLowerCase();
  return inventoryNames.some((item) => normalized.includes(item));
}

export function runMealPlannerTool(name, args = {}) {
  if (name === "create_meal_plan") {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const inventoryNames = (args.inventory ?? []).map((item) => String(item.name ?? item).toLowerCase().trim()).filter(Boolean);
    const recipes = (args.recipes ?? []).map((recipe) => ({
      ...recipe,
      matches: (recipe.ingredients ?? []).filter((ingredient) => inventoryMatch(ingredient, inventoryNames)).length,
    })).sort((a, b) => b.matches - a.matches);
    if (!recipes.length) return { plan: [] };
    return { plan: days.map((day, index) => ({ day, ...recipes[index % recipes.length] })) };
  }

  if (name === "replace_meal") {
    return { plan: (args.plan ?? []).map((meal) => meal.day === args.day ? { day: meal.day, ...args.recipe } : meal) };
  }

  if (name === "build_grocery_list") {
    const inventoryNames = (args.inventory ?? []).map((item) => String(item.name ?? item).toLowerCase().trim()).filter(Boolean);
    const ingredients = (args.plan ?? []).flatMap((meal) => meal.ingredients ?? []);
    return { groceryList: [...new Set(ingredients.filter((ingredient) => !inventoryMatch(ingredient, inventoryNames)))] };
  }

  throw new Error(`Unknown meal planner tool: ${name}`);
}
