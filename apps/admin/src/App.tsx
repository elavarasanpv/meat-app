import { Refine } from "@refinedev/core";
import { dataProvider } from "@refinedev/supabase";
import { supabase } from "./supabase";

/**
 * Admin shell. Next steps: auth provider (Supabase, admin role only),
 * resources for orders / dealers / riders / cash, and the live order board.
 */
export function App() {
  return (
    <Refine
      dataProvider={dataProvider(supabase)}
      resources={[
        { name: "orders", list: "/orders" },
        { name: "dealers", list: "/dealers" },
        { name: "delivery_partners", list: "/riders" },
        { name: "cash_submissions", list: "/cash" },
      ]}
    >
      <main style={{ fontFamily: "system-ui", padding: 32 }}>
        <h1 style={{ color: "#E4461F" }}>FreshCut Admin</h1>
        <p>Scaffold ready — order board comes next.</p>
      </main>
    </Refine>
  );
}
