import { Routes, Route } from "react-router-dom";
import { Sidebar, MobileNav } from "./components/ui/Sidebar";
import { useSession } from "./lib/useSession";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import Campaigns from "./pages/Campaigns";
import Cadences from "./pages/Cadences";
import AiSdr from "./pages/AiSdr";
import Prospeccao from "./pages/Prospeccao";
import Crm from "./pages/Crm";
import Financeiro from "./pages/Financeiro";
import Alfred from "./pages/Alfred";
import Relatorios from "./pages/Relatorios";
import Aprendizado from "./pages/Aprendizado";
import Agenda from "./pages/Agenda";
import Inbox from "./pages/Inbox";
import Instances from "./pages/Instances";

export default function App() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-muted">
        Carregando…
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MobileNav />
      <main className="flex-1 overflow-x-hidden px-4 pb-8 pt-20 md:px-10 md:py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/campanhas" element={<Campaigns />} />
          <Route path="/cadencias" element={<Cadences />} />
          <Route path="/ia-sdr" element={<AiSdr />} />
          <Route path="/aprendizado" element={<Aprendizado />} />
          <Route path="/prospeccao" element={<Prospeccao />} />
          <Route path="/crm" element={<Crm />} />
          <Route path="/financeiro" element={<Financeiro />} />
          <Route path="/alfred" element={<Alfred />} />
          <Route path="/relatorios" element={<Relatorios />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/instancias" element={<Instances />} />
        </Routes>
      </main>
    </div>
  );
}
