import { supabase } from "./supabaseClient";

export type PatentSearchInsight = {
  id: number;
  display_order: number;
  title: string;
  body: string;
};

export async function loadPatentSearchInsights(): Promise<PatentSearchInsight[]> {
  const { data, error } = await supabase
    .from("patent_search_insights")
    .select("id, display_order, title, body")
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as PatentSearchInsight[];
}
