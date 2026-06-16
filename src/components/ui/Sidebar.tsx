import { NavLink } from "react-router-dom";
import { LayoutDashboard, Upload, MessageSquare, Smartphone, Send, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/upload", label: "Importar Leads", icon: Upload },
  { to: "/inbox", label: "Inbox CRM", icon: MessageSquare },
  { to: "/instancias", label: "Instâncias", icon: Smartphone },
];

export function Sidebar() {
  return (
    <aside className="glass sticky top-0 flex h-screen w-64 flex-col rounded-r-xl2 p-4">
      <div className="mb-8 flex items-center gap-2 px-2 pt-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
          <Send size={18} />
        </div>
        <div className="leading-tight">
          <div className="font-semibold">Disparo</div>
          <div className="text-xs text-ink-muted">Lotérica · B2B</div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? "bg-accent text-white shadow-sm" : "text-ink-soft hover:bg-black/5"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto">
        <button
          onClick={() => supabase.auth.signOut()}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-black/5"
        >
          <LogOut size={18} /> Sair
        </button>
        <div className="px-2 pt-3 text-xs text-ink-muted">
          Round-robin · 1 msg / 30–45min por chip
        </div>
      </div>
    </aside>
  );
}
