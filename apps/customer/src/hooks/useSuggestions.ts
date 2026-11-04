import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type SuggestionItem = {
  productId: string;
  name: string;
  nameTa: string | null;
  unit: "kg" | "piece";
  price: number;
  qty: number;
  size: "small" | "medium" | "large" | null;
  imagePath: string | null;
};
export type Suggestion = {
  kind: "habit" | "favourite" | "last" | "popular";
  day?: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
  items: SuggestionItem[];
  total: number;
};

/** "For you" cards on the home screen, worked out from the customer's own orders. */
export function useSuggestions() {
  return useQuery({ queryKey: ["suggestions"], queryFn: () => api<Suggestion[]>("/orders/suggestions"), staleTime: 5 * 60_000 });
}
