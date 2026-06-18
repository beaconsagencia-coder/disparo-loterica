import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Upload, Megaphone, GitBranch, Bot, Radar, CalendarDays, MessageSquare, Smartphone, Send, LogOut, Menu, X, BarChart3, Brain } from "lucide-react";
import { supabase } from "@/lib/supabase";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/prospeccao", label: "Prospecção", icon: Radar },
  { to: "/upload", label: "Importar Leads", icon: Upload },
  { to: "/cadencias", label: "Cadências", icon: GitBranch },
  { to: "/campanhas", label: "Campanhas", icon: Megaphone },
  { to: "/ia-sdr", label: "SDR com IA", icon: Bot },
  { to: "/aprendizado", label: "Aprendizado", icon: Brain },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/inbox", label: "Inbox CRM", icon: MessageSquare },
  { to: "/instancias", label: "Instâncias", icon: Smartphone },
];

/** Marca/logo do app, reutilizada no desktop e no drawer mobile. */
function Brand() {
  return (
    <div className="flex items-center gap-2 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
        <Send size={18} />
      </div>
      <div className="leading-tight">
        <div className="font-semibold">Disparo</div>
        <div className="text-xs text-ink-muted">Lotérica · B2B</div>
      </div>
    </div>
  );
}

/** Conteúdo de navegação (links + sair). onNavigate fecha o drawer no mobile. */
function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <nav className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
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
    </>
  );
}

/** Sidebar fixa — apenas em telas md+. */
export function Sidebar() {
  return (
    <aside className="glass sticky top-0 hidden h-screen w-64 flex-col rounded-r-xl2 p-4 md:flex">
      <div className="mb-8 pt-2"><Brand /></div>
      <NavContent />
    </aside>
  );
}

/** Topbar + drawer deslizante — apenas no mobile (< md). */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Barra superior fixa */}
      <header className="glass fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 md:hidden">
        <Brand />
        <button
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft hover:bg-black/5"
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Drawer + backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="glass absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col rounded-r-xl2 p-4">
            <div className="mb-6 flex items-center justify-between pt-1">
              <Brand />
              <button
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft hover:bg-black/5"
              >
                <X size={22} />
              </button>
            </div>
            <NavContent onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
