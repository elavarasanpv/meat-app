import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/store/auth";

export type Profile = { full_name: string | null; phone: string | null };

export function useProfile() {
  const userId = useAuth((s) => s.session?.user.id);
  return useQuery({
    queryKey: ["profile", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("full_name, phone").eq("id", userId!).maybeSingle();
      if (error) throw error;
      return (data ?? { full_name: null, phone: null }) as Profile;
    },
  });
}

export function useUpdateName() {
  const qc = useQueryClient();
  const userId = useAuth((s) => s.session?.user.id);
  return useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("profiles").update({ full_name: name.trim() || null }).eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profile", userId] }),
  });
}
