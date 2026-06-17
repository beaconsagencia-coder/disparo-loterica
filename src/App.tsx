import { Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/ui/Sidebar";
import { useSession } from "./lib/useSession";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import Campaigns from "./pages/Campaigns";
import Cadences from "./pages/Cadences";
import AiSdr from "./pages/AiSdr";
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
      <main className="flex-1 overflow-x-hidden px-6 py-6 md:px-10">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/campanhas" element={<Campaigns />} />
          <Route path="/cadencias" element={<Cadences />} />
          <Route path="/ia-sdr" element={<AiSdr />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/instancias" element={<Instances />} />
        </Routes>
      </main>
    </div>
  );
}
