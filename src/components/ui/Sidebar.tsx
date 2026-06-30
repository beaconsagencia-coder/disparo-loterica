import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Upload, Megaphone, GitBranch, Bot, Radar, CalendarDays, MessageSquare, Smartphone, Send, LogOut, Menu, X, BarChart3, Brain, KanbanSquare, Wallet, Users } from "lucide-react";
import { supabase } from "@/lib/supabase";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/crm", label: "CRM", icon: KanbanSquare },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/prospeccao", label: "Prospecção", icon: Radar },
  { to: "/upload", label: "Importar Leads", icon: Upload },
  { to: "/cadencias", label: "Cadências", icon: GitBranch },
  { to: "/campanhas", label: "Campanhas", icon: Megaphone },
  { to: "/ia-sdr", label: "SDR com IA", icon: Bot },
  { to: "/aprendizado", label: "Aprendizado", icon: Brain },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/inbox", label: "Inbox CRM", icon: MessageSquare },
  { to: "/alfred", label: "Alfred (grupos)", icon: Users },
  { to: "/instancias", label: "Instâncias", icon: Smartphone },
];

/** Marca/logo do app, reutilizada no desktop e no drawer mobile. */
function Brand({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-2 px-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white">
        <Send size={18} />
      </div>
      <div className="leading-tight">
        <div className={`font-semibold ${dark ? "text-white" : ""}`}>Disparo</div>
        <div className={`text-xs ${dark ? "text-white/40" : "text-ink-muted"}`}>Lotérica · B2B</div>
      </div>
    </div>
  );
}

/** Conteúdo de navegação (links + sair). onNavigate fecha o drawer no mobile. */
function NavContent({ onNavigate, dark }: { onNavigate?: () => void; dark?: boolean }) {
  const inativo = dark ? "text-white/65 hover:bg-white/[0.06]" : "text-ink-soft hover:bg-black/5";
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
                isActive ? "bg-accent text-white shadow-sm" : inativo
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
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${inativo}`}
        >
          <LogOut size={18} /> Sair
        </button>
        <div className={`px-2 pt-3 text-xs ${dark ? "text-white/40" : "text-ink-muted"}`}>
          Round-robin · 1 msg / 30–45min por chip
        </div>
      </div>
    </>
  );
}

/** Sidebar fixa — apenas em telas md+. */
export function Sidebar({ dark }: { dark?: boolean }) {
  return (
    <aside className={`sticky top-0 hidden h-screen w-64 flex-col rounded-r-xl2 p-4 md:flex ${dark ? "border-r border-white/10 bg-[#0c0d12]" : "glass"}`}>
      <div className="mb-8 pt-2"><Brand dark={dark} /></div>
      <NavContent dark={dark} />
    </aside>
  );
}

/** Topbar + drawer deslizante — apenas no mobile (< md). */
export function MobileNav({ dark }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const btn = dark ? "text-white/70 hover:bg-white/[0.06]" : "text-ink-soft hover:bg-black/5";
  return (
    <>
      {/* Barra superior fixa */}
      <header className={`fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 md:hidden ${dark ? "border-b border-white/10 bg-[#0c0d12]" : "glass"}`}>
        <Brand dark={dark} />
        <button
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${btn}`}
        >
          <Menu size={22} />
        </button>
      </header>

      {/* Drawer + backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className={`absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col rounded-r-xl2 p-4 ${dark ? "border-r border-white/10 bg-[#0c0d12]" : "glass"}`}>
            <div className="mb-6 flex items-center justify-between pt-1">
              <Brand dark={dark} />
              <button
                aria-label="Fechar menu"
                onClick={() => setOpen(false)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl ${btn}`}
              >
                <X size={22} />
              </button>
            </div>
            <NavContent onNavigate={() => setOpen(false)} dark={dark} />
          </aside>
        </div>
      )}
    </>
  );
}
