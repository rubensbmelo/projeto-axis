import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  BarChart3,
  FolderCog,
  Home,
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
  { to: "/inicio", label: "Início", icon: Home },
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
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card/50 md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <Activity className="size-5" />
          <span className="font-heading text-lg font-semibold">AXIS</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
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
        <div className="border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={() => supabase.auth.signOut()}
          >
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        {/* Header — desktop */}
        <header className="hidden h-14 items-center justify-end gap-3 border-b bg-card/50 px-6 md:flex">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={() => supabase.auth.signOut()}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>

      {/* Navegação inferior — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t bg-background/95 backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <Icon className="size-5 shrink-0" />
            <span className="w-full truncate text-center">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
