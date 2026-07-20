import { supabase } from "./supabase";

export type LibraryKind = "recipe" | "restaurant";

type StoredItem<T> = {
  item_id: string;
  payload: T;
};

export async function loadCloudItems<T>(kind: LibraryKind): Promise<T[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("library_items")
    .select("item_id,payload")
    .eq("kind", kind)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return ((data || []) as StoredItem<T>[]).map((row) => row.payload);
}

export async function syncCloudItems<T extends { id: string }>(kind: LibraryKind, items: T[]) {
  if (!supabase) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) throw new Error("Sign in before syncing your library.");

  if (items.length) {
    const { error } = await supabase.from("library_items").upsert(
      items.map((item) => ({
        user_id: user.id,
        kind,
        item_id: item.id,
        payload: item,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,kind,item_id" },
    );
    if (error) throw error;
  }

  const { data: stored, error: storedError } = await supabase
    .from("library_items")
    .select("item_id")
    .eq("kind", kind);
  if (storedError) throw storedError;

  const currentIds = new Set(items.map((item) => item.id));
  const staleIds = (stored || []).map((row) => row.item_id as string).filter((id) => !currentIds.has(id));
  if (staleIds.length) {
    const { error: deleteError } = await supabase
      .from("library_items")
      .delete()
      .eq("kind", kind)
      .in("item_id", staleIds);
    if (deleteError) throw deleteError;
  }
}
