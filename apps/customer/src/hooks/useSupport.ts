import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { api } from "@/lib/api";

export type Ticket = {
  id: string;
  type: string;
  typeLabel: string;
  status: "open" | "waiting_customer" | "resolved" | "closed";
  body: string | null;
  creditAmount: number | null;
  resolution: string | null;
  order: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TicketMessage = { id: string; sender: "customer" | "admin" | "system"; body: string | null; photoUrl: string | null; at: string };
export type TicketThread = Omit<Ticket, "order"> & { order: { displayId: string; status: string; amount: number } | null; messages: TicketMessage[] };

export function useMyTickets() {
  return useQuery({ queryKey: ["support", "tickets"], queryFn: () => api<Ticket[]>("/support/tickets"), refetchInterval: 30_000 });
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: ["support", "ticket", id],
    queryFn: () => api<TicketThread>(`/support/tickets/${id}`),
    enabled: !!id,
    refetchInterval: 15_000,
  });
}

export function useWallet() {
  return useQuery({
    queryKey: ["support", "wallet"],
    queryFn: () => api<{ balance: number; entries: { amount: number; reason: string; order: string | null; at: string }[] }>("/support/wallet"),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orderId?: string; orderItemId?: string; type: string; body: string; photoBase64?: string }) =>
      api<{ id: string; autoCredited?: boolean; amount?: number }>("/support/tickets", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support"] }),
  });
}

export function useReplyTicket(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; photoBase64?: string }) => api(`/support/tickets/${id}/reply`, { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support"] }),
  });
}

/** Pick a photo from the gallery, shrink it and return base64 JPEG (null = cancelled). */
export async function pickPhotoBase64(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const MAX = 1024;
  const ctx = ImageManipulator.manipulate(a.uri);
  if ((a.width ?? 0) > MAX || (a.height ?? 0) > MAX) {
    ctx.resize((a.width ?? 1) >= (a.height ?? 1) ? { width: MAX } : { height: MAX });
  }
  const rendered = await ctx.renderAsync();
  const small = await rendered.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  return small.base64 ?? null;
}
