import { useState } from "react";
import { Send, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const [mode, setMode] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        // o App detecta a sessão e troca de tela sozinho
      } else {
        const { error } = await supabase.auth.signUp({ email, password: senha });
        if (error) throw error;
        setInfo("Conta criada! Se o e-mail de confirmação estiver ativo, confirme antes de entrar.");
        setMode("entrar");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na autenticação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-strong w-full max-w-sm rounded-xl2 p-8">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-white">
            <Send size={20} />
          </div>
          <div className="leading-tight">
            <div className="text-lg font-semibold">Disparo Lotérica</div>
            <div className="text-xs text-ink-muted">CRM B2B · WhatsApp</div>
          </div>
        </div>

        <h1 className="mb-4 text-xl font-semibold tracking-tight">
          {mode === "entrar" ? "Entrar" : "Criar conta"}
        </h1>

        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-[#b4231b]">
            <AlertTriangle size={15} /> {error}
          </div>
        )}
        {info && (
          <div className="mb-3 rounded-xl bg-success/10 px-3 py-2 text-sm text-[#1b7a35]">{info}</div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">E-mail</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Senha</label>
            <input
              type="password"
              required
              minLength={6}
              className="input"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn-accent w-full" disabled={busy}>
            {busy ? "Aguarde…" : mode === "entrar" ? "Entrar" : "Criar conta"}
          </button>
        </form>

        <button
          className="btn-ghost mt-3 w-full"
          onClick={() => {
            setMode(mode === "entrar" ? "criar" : "entrar");
            setError(null);
            setInfo(null);
          }}
        >
          {mode === "entrar" ? "Não tem conta? Criar agora" : "Já tenho conta. Entrar"}
        </button>
      </div>
    </div>
  );
}
