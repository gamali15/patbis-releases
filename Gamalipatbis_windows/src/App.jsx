import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";
import StokYukle from "./pages/StokYukle";
import BarkodSorgula from "./pages/BarkodSorgula";
import StokCikis from "./pages/StokCikis";
import Raporlar from "./pages/Raporlar";
import Ayarlar from "./pages/Ayarlar";

import Login from "./pages/Login";
import { usePython } from "./hooks/usePython";
import HakkindaModal from "./components/HakkindaModal";

// İleride eklenecek sayfalar
const PlaceholderPage = ({ title }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    fontFamily: "var(--font-display)",
    fontSize: "1.2rem",
    color: "var(--text-muted)",
    letterSpacing: "2px",
  }}>
    {title} — YAKINDA
  </div>
);

const PAGES = {
  dashboard: { component: Dashboard, title: "Dashboard" },
  stok_yukle: { component: StokYukle, title: "Stok Yükle" },
  barkod_sorgula: { component: BarkodSorgula, title: "Barkod Sorgula" },
  patlatma: { component: (p) => <StokCikis python={p.python} />, title: "Stok Çıkış" },
  raporlar: { component: (p) => <Raporlar python={p.python} />, title: "Raporlar" },
  ayarlar: { component: (p) => <Ayarlar python={p.python} />, title: "Ayarlar" },
};

export default function App() {
  const [activeUser, setActiveUser] = useState(null);
  const [activePage, setActivePage] = useState("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const python = usePython();

  // Uygulama açılınca Python bridge'i başlat
  useEffect(() => {
    python.connect();
  }, []);

  if (!activeUser) {
    return <Login onLogin={setActiveUser} python={python} />;
  }

  const CurrentPage = PAGES[activePage]?.component || Dashboard;

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      width: "100vw",
      background: "var(--bg-void)",
      overflow: "hidden",
    }}>
      <Sidebar
        activePage={activePage}
        onNavigate={setActivePage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        activeUser={activeUser}
        onLogout={() => {
          setActiveUser(null);
          setActivePage("dashboard");
        }}
        onAboutClick={() => setShowAbout(true)}
      />

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}>
        <Header
          title={PAGES[activePage]?.title || "Dashboard"}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          python={python}
        />

        <main style={{
          flex: 1,
          overflow: "auto",
          padding: "24px",
        }}>
          <CurrentPage python={python} />
        </main>
      </div>

      {/* ─── HAKKINDA MODAL (Cyberpunk V2.0 Standalone Component) ─── */}
      {showAbout && <HakkindaModal onKapat={() => setShowAbout(false)} />}
    </div>
  );
}
