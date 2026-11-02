import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { Gate } from "./auth/Gate";
import { Login } from "./auth/Login";
import { SetPassword } from "./auth/SetPassword";
import { Shell } from "./shell/Shell";
import { Dashboard } from "./pages/Dashboard";
import { Orders } from "./pages/Orders";
import { Shops } from "./pages/Shops";
import { Riders } from "./pages/Riders";
import { Cash } from "./pages/Cash";
import { Notifications } from "./pages/Notifications";
import { Settings } from "./pages/Settings";
import { Support } from "./pages/Support";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/set-password" element={<SetPassword />} />
          <Route element={<Gate />}>
            <Route element={<Shell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/shops" element={<Shops />} />
              <Route path="/riders" element={<Riders />} />
              <Route path="/cash" element={<Cash />} />
              <Route path="/support" element={<Support />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
