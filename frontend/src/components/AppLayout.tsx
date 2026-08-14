import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  FolderCog,
  LogOut,
  ShieldCheck,
  Stethoscope,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { supabase } from "@/api/supabase";
import { useAuth } from "@/auth/AuthContext";

const NAV = [
  { to: "/casos", label: "Casos", icon: Stethoscope },
  { to: "/pacientes", label: "Pacientes", icon: Users },
  { to: "/cadastros", label: "Cadastros", icon: FolderCog },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/membros", label: "Membros", icon: ShieldCheck },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-card/50">
        <div className="flex items-center gap-2 px-5 py-5">
          <Activity className="size-5" />
          <span className="font-heading text-lg font-semibold">AXIS</span>
        </div>
        <nav className="flex flex-col gap-1 px-3">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-end gap-3 border-b bg-card/50 px-6">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
