import { useState, useEffect } from "react";
import { Lock, ShieldAlert, AlertCircle, Loader2, ArrowRight, User } from "lucide-react";

export default function Login({ onLogin, python }) {
  const [sifre, setSifre] = useState("");
  const [personelId, setPersonelId] = useState("");
  const [personeller, setPersoneller] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    if (!python.ready) return;
    
    python.call("db.personeller").then(r => {
      if (r?.basarili && r.personeller) {
        setPersoneller(r.personeller);
      }
    }).catch(() => {});
  }, [python.ready, python.call]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!sifre) return;

    setYukleniyor(true);
    setHata(null);

    try {
      // Python üzerinden şifre kontrolü
      const resp = await python.call("drive.login", { 
        sifre,
        personel_id: personelId ? parseInt(personelId) : null
      });
      
      if (resp?.basarili) {
        onLogin(resp.kullanici || true);
      } else {
        setHata(resp?.mesaj || "Hatalı şifre!");
      }
    } catch (err) {
      setHata("Sistem bağlantı hatası!");
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div style={S.overlay}>
      <div style={S.backgroundGlow} />
      
      <div style={S.card}>
        <div style={S.logoArea}>
          <img src="/gamali-logo-full.png" alt="Logo" style={{ ...S.logo, width: "200px", height: "auto", marginBottom: 0 }} />
          <div style={S.subBrand}>GÜVENLİ ERİŞİM PANELİ</div>
        </div>

        <form onSubmit={handleSubmit} style={S.form}>
          <div style={S.inputWrapper}>
            <User size={18} style={S.inputIcon} />
            <select
              value={personelId}
              onChange={(e) => setPersonelId(e.target.value)}
              style={{ ...S.input, appearance: "none", cursor: "pointer" }}
            >
              <option value="" style={{ background: "#0f172a" }}>-- Yönetici Girişi --</option>
              {personeller.map(p => (
                <option key={p.id} value={p.id} style={{ background: "#0f172a" }}>
                  {p.ad_soyad} {p.unvan ? `(${p.unvan})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={S.inputWrapper}>
            <Lock size={18} style={S.inputIcon} />
            <input
              type="password"
              value={sifre}
              onChange={(e) => setSifre(e.target.value)}
              placeholder="SİSTEM ŞİFRESİ"
              style={S.input}
              autoFocus
            />
          </div>

          {hata && (
            <div style={S.hataKutu}>
              <AlertCircle size={14} />
              <span>{hata}</span>
            </div>
          )}

          <button type="submit" disabled={yukleniyor} style={S.btn}>
            {yukleniyor ? (
              <Loader2 size={20} className="spin" />
            ) : (
              <>
                SİSTEME GİRİŞ YAP <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        <div style={S.footer}>
          <ShieldAlert size={12} />
          <span>AES-256 ŞİFRELEME AKTİF</span>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes glowPulse { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const S = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "#020617",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    overflow: "hidden",
  },
  backgroundGlow: {
    position: "absolute",
    width: "600px",
    height: "600px",
    background: "radial-gradient(circle, rgba(0, 212, 255, 0.15) 0%, rgba(2, 6, 23, 0) 70%)",
    filter: "blur(40px)",
    animation: "glowPulse 4s infinite ease-in-out",
  },
  card: {
    width: "380px",
    background: "rgba(15, 23, 42, 0.8)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(0, 212, 255, 0.15)",
    borderRadius: "24px",
    padding: "40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 212, 255, 0.05)",
    animation: "fadeIn 0.6s ease-out",
    zIndex: 1,
  },
  logoArea: {
    textAlign: "center",
    marginBottom: 32,
  },
  logo: {
    width: "64px",
    height: "64px",
    marginBottom: 16,
    filter: "drop-shadow(0 0 10px rgba(0, 212, 255, 0.3))",
  },
  brand: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "1.2rem",
    fontWeight: 800,
    color: "#fff",
    letterSpacing: "4px",
    marginBottom: 4,
  },
  subBrand: {
    fontSize: "0.7rem",
    color: "rgba(0, 212, 255, 0.6)",
    fontWeight: 600,
    letterSpacing: "2px",
  },
  form: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  inputWrapper: {
    position: "relative",
    width: "100%",
  },
  inputIcon: {
    position: "absolute",
    left: 14,
    top: "50%",
    transform: "translateY(-50%)",
    color: "rgba(0, 212, 255, 0.4)",
  },
  input: {
    width: "100%",
    background: "rgba(2, 6, 23, 0.4)",
    border: "1px solid rgba(0, 212, 255, 0.1)",
    borderRadius: "12px",
    padding: "14px 14px 14px 44px",
    color: "#fff",
    fontSize: "0.9rem",
    fontFamily: "'Rajdhani', sans-serif",
    fontWeight: 600,
    letterSpacing: "2px",
    outline: "none",
    transition: "all 0.2s",
  },
  hataKutu: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    background: "rgba(255, 0, 85, 0.1)",
    border: "1px solid rgba(255, 0, 85, 0.2)",
    borderRadius: "10px",
    color: "#ff0055",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  btn: {
    width: "100%",
    background: "var(--neon-blue, #00d4ff)",
    border: "none",
    borderRadius: "12px",
    padding: "14px",
    color: "#000",
    fontFamily: "'Orbitron', sans-serif",
    fontWeight: 800,
    fontSize: "0.85rem",
    letterSpacing: "1px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    transition: "all 0.2s",
    boxShadow: "0 0 20px rgba(0, 212, 255, 0.2)",
  },
  footer: {
    marginTop: 32,
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: "rgba(255, 255, 255, 0.2)",
    fontSize: "0.6rem",
    fontWeight: 600,
    letterSpacing: "1px",
  },
};
