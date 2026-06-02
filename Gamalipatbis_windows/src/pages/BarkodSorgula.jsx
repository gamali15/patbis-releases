/**
 * GAMALI PATBİS — Barkod Sorgula Sayfası
 *
 * UID ile palet / kutu / ürün hiyerarşi ağacını görüntüler.
 * Python core'daki BarkodSorgulaSayfasi'nın React/Tauri karşılığı.
 *
 * Akış: UID gir → Python bridge "barkod.sorgula" → ağaç + detay paneli
 */
import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  Search,
  X,
  ChevronRight,
  ChevronDown,
  Package,
  Box,
  Layers,
  AlertCircle,
  Copy,
  CheckCircle2,
  Clock,
  Hash,
  MapPin,
  Tag,
  Info,
  Loader2,
} from "lucide-react";

// ─── Sabitler ───────────────────────────────────────────────────────────────

const TIP_ICON = {
  palet: Layers,
  kutu: Box,
  urun: Package,
};

const TIP_RENK = {
  palet: { bg: "rgba(139, 92, 246, 0.12)", border: "rgba(139, 92, 246, 0.3)", text: "#a78bfa", label: "PALET" },
  kutu: { bg: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.3)", text: "#60a5fa", label: "KUTU" },
  urun: { bg: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.3)", text: "#4ade80", label: "ÜRÜN" },
};

const DURUM_RENK = {
  aktif: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ade80", label: "AKTİF" },
  cikis: { bg: "rgba(251, 191, 36, 0.15)", text: "#fbbf24", label: "ÇIKIŞ" },
  iptal: { bg: "rgba(239, 68, 68, 0.15)", text: "#ef4444", label: "İPTAL" },
  patlatma: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316", label: "PATLATMA" },
};

// ─── Yardımcı Fonksiyonlar ──────────────────────────────────────────────────

function toplamUrun(node) {
  if (!node) return 0;
  if (node.tip === "urun") return 1;
  if (!node.cocuklar) return 0;
  return node.cocuklar.reduce((t, c) => t + toplamUrun(c), 0);
}

function bulNode(node, targetUid) {
  if (!node) return null;
  if (node.uid && node.uid.toString().trim().toLowerCase() === targetUid.toString().trim().toLowerCase()) {
    return node;
  }
  if (node.cocuklar && node.cocuklar.length > 0) {
    for (const child of node.cocuklar) {
      const found = bulNode(child, targetUid);
      if (found) return found;
    }
  }
  return null;
}

// ─── Ağaç Düğümü ───────────────────────────────────────────────────────────

function AgacDugumu({ node, derinlik = 0, seciliUid, onSecim }) {
  const [acik, setAcik] = useState(derinlik < 2);
  const hasCocuk = node.cocuklar && node.cocuklar.length > 0;
  const secili = seciliUid === node.uid;
  const tipR = TIP_RENK[node.tip] || TIP_RENK.urun;
  const Icon = TIP_ICON[node.tip] || Package;

  useEffect(() => {
    if (seciliUid && node.cocuklar) {
      const hasSeciliCocuk = (n, target) => {
        if (!n || !n.cocuklar) return false;
        return n.cocuklar.some(c => c.uid === target || hasSeciliCocuk(c, target));
      };
      if (hasSeciliCocuk(node, seciliUid)) {
        setAcik(true);
      }
    }
  }, [seciliUid, node]);

  return (
    <div>
      {/* Düğüm satırı */}
      <div
        onClick={() => onSecim(node)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 8px",
          paddingLeft: 8 + derinlik * 20,
          cursor: "pointer",
          borderRadius: 6,
          background: secili ? "rgba(139, 92, 246, 0.12)" : "transparent",
          borderLeft: secili ? "2px solid #a78bfa" : "2px solid transparent",
          transition: "all 0.15s",
        }}
        onMouseEnter={(e) => {
          if (!secili) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
        }}
        onMouseLeave={(e) => {
          if (!secili) e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Aç/kapa oku */}
        {hasCocuk ? (
          <span
            onClick={(e) => { e.stopPropagation(); setAcik(!acik); }}
            style={{ cursor: "pointer", color: "#64748b", display: "flex", width: 16, flexShrink: 0 }}
          >
            {acik ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}

        {/* Tip ikonu */}
        <span style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: 5,
          background: tipR.bg, border: `1px solid ${tipR.border}`, flexShrink: 0,
        }}>
          <Icon size={12} color={tipR.text} />
        </span>

        {/* UID */}
        <span style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 12, color: secili ? "#e2e8f0" : "#94a3b8",
          fontWeight: secili ? 600 : 400,
        }}>
          {node.uid}
        </span>

        {/* Tip etiketi */}
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
          color: tipR.text, opacity: 0.7,
          marginLeft: "auto", flexShrink: 0,
        }}>
          {tipR.label}
        </span>

        {/* Çocuk sayısı */}
        {hasCocuk && (
          <span style={{
            fontSize: 10, color: "#475569",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            ({node.cocuklar.length})
          </span>
        )}
      </div>

      {/* Alt düğümler */}
      {hasCocuk && acik && (
        <div>
          {node.cocuklar.map((c) => (
            <AgacDugumu
              key={c.uid}
              node={c}
              derinlik={derinlik + 1}
              seciliUid={seciliUid}
              onSecim={onSecim}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detay Satırı ───────────────────────────────────────────────────────────

function DetaySatir({ icon: Icon, etiket, deger, mono = false, kopyalanabilir = false }) {
  const [kopyalandi, setKopyalandi] = useState(false);

  const kopyala = () => {
    navigator.clipboard.writeText(deger).then(() => {
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 1500);
    });
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 0",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <Icon size={14} color="#475569" style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "#64748b", minWidth: 90, flexShrink: 0 }}>
        {etiket}
      </span>
      <span style={{
        fontSize: 12.5,
        color: "#e2e8f0",
        fontFamily: mono ? "'JetBrains Mono', monospace" : "inherit",
        fontWeight: mono ? 500 : 400,
        flex: 1,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}>
        {deger || "—"}
      </span>
      {kopyalanabilir && deger && (
        <button
          onClick={kopyala}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: kopyalandi ? "#4ade80" : "#475569",
            padding: 2, display: "flex", flexShrink: 0,
            transition: "color 0.2s",
          }}
          title="Kopyala"
        >
          {kopyalandi ? <CheckCircle2 size={13} /> : <Copy size={13} />}
        </button>
      )}
    </div>
  );
}

// ─── Detay Paneli ───────────────────────────────────────────────────────────

function DetayPaneli({ node, agac, onSecim, onSorgula }) {
  if (!node) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", gap: 12,
        color: "#334155",
      }}>
        <Search size={36} strokeWidth={1} />
        <span style={{ fontSize: 13 }}>UID girin veya ağaçtan bir öğe seçin</span>
      </div>
    );
  }

  const tipR = TIP_RENK[node.tip] || TIP_RENK.urun;
  const durumR = DURUM_RENK[node.durum] || DURUM_RENK.aktif;
  const Icon = TIP_ICON[node.tip] || Package;

  // Hiyerarşi bulma yardımcıları
  const findParent = (root, targetUid) => {
    if (!root || !root.cocuklar) return null;
    for (const child of root.cocuklar) {
      if (child.uid === targetUid) return root;
      const p = findParent(child, targetUid);
      if (p) return p;
    }
    return null;
  };

  let parentNode = node ? findParent(agac, node.uid) : null;
  let grandparentNode = parentNode ? findParent(agac, parentNode.uid) : null;

  // Akıllı Fallback: Eğer ağaç kısıtlanmışsa (sadece ürün veya koli varsa), üst düğümleri backend'den gelen referanslarla sanal olarak oluştur.
  if (!parentNode) {
    if (node.tip === "urun" && node.ust_kutu) {
      parentNode = { uid: node.ust_kutu, tip: "kutu" };
    } else if (node.tip === "kutu" && node.parent_uid) {
      parentNode = { uid: node.parent_uid, tip: "palet" };
    }
  }
  if (!grandparentNode) {
    if (node.tip === "urun" && node.ust_palet) {
      grandparentNode = { uid: node.ust_palet, tip: "palet" };
    }
  }

  // Tıklama ile zıplama/arama
  const handleJump = (targetNode) => {
    if (!targetNode) return;
    const inTree = bulNode(agac, targetNode.uid);
    if (inTree) {
      onSecim(inTree);
    } else {
      // Eğer ağaçta yoksa yeni bir sorgulama tetikler
      if (onSorgula) {
        onSorgula(targetNode.uid);
      } else {
        onSecim(targetNode);
      }
    }
  };

  return (
    <div style={{ padding: "16px 18px", overflowY: "auto", height: "100%" }}>
      {/* Başlık kartı */}
      <div style={{
        background: tipR.bg,
        border: `1px solid ${tipR.border}`,
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8,
          background: "rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon size={20} color={tipR.text} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
            color: tipR.text, marginBottom: 2,
          }}>
            {tipR.label}
          </div>
          <div style={{
            fontSize: 15, fontWeight: 600, color: "#f1f5f9",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {node.uid}
          </div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
          padding: "3px 8px", borderRadius: 4,
          background: durumR.bg, color: durumR.text,
        }}>
          {durumR.label}
        </span>
      </div>

      {/* ─── HİYERARŞİ KONUMU PANALİ (Kullanıcı İsteği - Çok Net Hiyerarşi) ─── */}
      <div style={{
        background: "rgba(124, 58, 237, 0.04)",
        border: "1px solid rgba(124, 58, 237, 0.15)",
        borderRadius: 10,
        padding: "14px 16px",
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
          color: "#a78bfa", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 6
        }}>
          <Layers size={13} /> HİYERARŞİ KONUMU
        </div>

        {node.tip === "urun" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>Bulunduğu Koli:</span>
              {parentNode ? (
                <button
                  onClick={() => handleJump(parentNode)}
                  style={{
                    background: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    color: "#60a5fa",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(59, 130, 246, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(59, 130, 246, 0.1)";
                  }}
                >
                  <Box size={11} /> {parentNode.uid}
                </button>
              ) : (
                <span style={{ color: "#475569", fontStyle: "italic" }}>Koli Yok</span>
              )}
            </div>

            {grandparentNode && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#64748b" }}>Bulunduğu Palet:</span>
                <button
                  onClick={() => handleJump(grandparentNode)}
                  style={{
                    background: "rgba(139, 92, 246, 0.1)",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    color: "#a78bfa",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)";
                  }}
                >
                  <Layers size={11} /> {grandparentNode.uid}
                </button>
              </div>
            )}
          </div>
        )}

        {node.tip === "kutu" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>Bulunduğu Palet:</span>
              {parentNode ? (
                <button
                  onClick={() => handleJump(parentNode)}
                  style={{
                    background: "rgba(139, 92, 246, 0.1)",
                    border: "1px solid rgba(139, 92, 246, 0.2)",
                    borderRadius: 6,
                    padding: "4px 8px",
                    color: "#a78bfa",
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 11,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    transition: "all 0.2s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(139, 92, 246, 0.1)";
                  }}
                >
                  <Layers size={11} /> {parentNode.uid}
                </button>
              ) : (
                <span style={{ color: "#475569", fontStyle: "italic" }}>Palet Yok</span>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>Kutu İçeriği:</span>
              <span style={{
                color: "#4ade80",
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(34, 197, 94, 0.1)",
                padding: "2px 8px",
                borderRadius: 4
              }}>
                {node.cocuklar ? node.cocuklar.length : 0} ÜRÜN
              </span>
            </div>
          </div>
        )}

        {node.tip === "palet" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>Sevkiyat Numarası:</span>
              <span style={{
                color: "#e2e8f0",
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 600,
                fontSize: 11,
                background: "rgba(255,255,255,0.06)",
                padding: "3px 8px",
                borderRadius: 4
              }}>
                {node.gonderi_no || "—"}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: "#64748b" }}>Palet İçeriği:</span>
              <span style={{
                color: "#60a5fa",
                fontSize: 11,
                fontWeight: 600,
                background: "rgba(59, 130, 246, 0.1)",
                padding: "2px 8px",
                borderRadius: 4
              }}>
                {node.cocuklar ? node.cocuklar.length : 0} KOLİ ({toplamUrun(node)} Ürün)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Detay alanları */}
      <div style={{
        background: "#0f1219",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 8,
        padding: "4px 14px",
        marginBottom: 16,
      }}>
        <DetaySatir icon={Hash} etiket="UID" deger={node.uid} mono kopyalanabilir />
        <DetaySatir icon={Tag} etiket="PSN" deger={node.psn} mono kopyalanabilir />
        <DetaySatir icon={Tag} etiket="SID" deger={node.sid} mono />
        {node.depo && <DetaySatir icon={MapPin} etiket="Depo" deger={node.depo} />}
        {node.urun_adi && <DetaySatir icon={Package} etiket="Ürün Adı" deger={node.urun_adi} />}
        {node.urun_kodu && <DetaySatir icon={Tag} etiket="Ürün Kodu" deger={node.urun_kodu} mono />}
        {node.parti_no && <DetaySatir icon={Hash} etiket="Parti No" deger={node.parti_no} mono />}
        {node.agirlik && <DetaySatir icon={Info} etiket="Ağırlık" deger={node.agirlik} />}
        {node.uretim_tarihi && <DetaySatir icon={Clock} etiket="Üretim" deger={node.uretim_tarihi} />}
        {node.son_kullanma && <DetaySatir icon={Clock} etiket="SKT" deger={node.son_kullanma} />}
        {node.gonderi_no && <DetaySatir icon={Info} etiket="Sevkiyat No" deger={node.gonderi_no} mono />}
        {parentNode && node.tip === "urun" && <DetaySatir icon={Box} etiket="Bulunduğu Koli" deger={parentNode.uid} mono />}
        {grandparentNode && node.tip === "urun" && <DetaySatir icon={Layers} etiket="Bulunduğu Palet" deger={grandparentNode.uid} mono />}
        {parentNode && node.tip === "kutu" && <DetaySatir icon={Layers} etiket="Bulunduğu Palet" deger={parentNode.uid} mono />}
      </div>

      {/* ─── ALT ÖĞELER LİSTESİ (Koli için Ürünler, Palet için Koliler) ─── */}
      {node.cocuklar && node.cocuklar.length > 0 && (
        <div style={{
          background: "#0f1219",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 8,
          padding: "12px 14px",
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
            color: "#64748b", marginBottom: 10,
            display: "flex", justifyContent: "space-between", alignItems: "center"
          }}>
            <span>İÇERİK LİSTESİ ({node.cocuklar.length} Öğe)</span>
            <span style={{ fontSize: 9, opacity: 0.7 }}>Detay için tıklayın</span>
          </div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            maxHeight: 220,
            overflowY: "auto",
            paddingRight: 4
          }}>
            {node.cocuklar.map((c) => {
              const cTipR = TIP_RENK[c.tip] || TIP_RENK.urun;
              const CIcon = TIP_ICON[c.tip] || Package;
              return (
                <div
                  key={c.uid}
                  onClick={() => onSecim(c)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.04)",
                    borderRadius: 6,
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                    e.currentTarget.style.borderColor = cTipR.text + "30";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)";
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    background: cTipR.bg, border: `1px solid ${cTipR.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <CIcon size={11} color={cTipR.text} />
                  </div>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                    <span style={{
                      fontSize: 11.5,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "#e2e8f0",
                      fontWeight: 500
                    }}>
                      {c.uid}
                    </span>
                    {c.urun_adi && (
                      <span style={{ fontSize: 9.5, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                        {c.urun_adi}
                      </span>
                    )}
                  </div>
                  {c.tip === "urun" && c.agirlik && (
                    <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "'JetBrains Mono', monospace" }}>
                      {c.agirlik}
                    </span>
                  )}
                  {c.tip === "kutu" && c.cocuklar && (
                    <span style={{
                      fontSize: 10,
                      color: "#60a5fa",
                      fontFamily: "'JetBrains Mono', monospace",
                      background: "rgba(59, 130, 246, 0.1)",
                      padding: "1px 5px",
                      borderRadius: 3
                    }}>
                      {c.cocuklar.length} Ürün
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Ana Bileşen ────────────────────────────────────────────────────────────

export default function BarkodSorgula({ python }) {
  const [uid, setUid] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState(null);
  const [agac, setAgac] = useState(null);        // kök node (ağaç verisi)
  const [secili, setSecili] = useState(null);     // seçilen node (detay paneli)
  const [gecmis, setGecmis] = useState([]);       // son sorgulanan UID'ler
  const inputRef = useRef(null);

  // Sayfa açılınca input'a fokusla
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Sorgulama ──
  const sorgula = useCallback(async (hedefUid) => {
    const uid_temiz = (hedefUid || uid).trim();
    if (!uid_temiz) return;

    setYukleniyor(true);
    setHata(null);

    try {
      let sonuc;

      if (python?.isTauri && python?.ready) {
        // Gerçek Python bridge
        sonuc = await python.call("barkod.sorgula", { uid: uid_temiz });
      } else {
        // Mock data logic removed to avoid confusion with real data
        sonuc = null; 
      }

      if (!sonuc || !sonuc.basarili) {
        setHata(`"${uid_temiz}" bulunamadı. UID'yi kontrol edin.`);
        setAgac(null);
        setSecili(null);
      } else {
        // Python'dan gelen hiyerarşik veriyi kullan
        setAgac(sonuc.data);
        const arananNode = bulNode(sonuc.data, uid_temiz);
        setSecili(arananNode || sonuc.data);
        setHata(null);

        // Geçmişe ekle (en fazla 10)
        setGecmis((prev) => {
          const yeni = [uid_temiz, ...prev.filter((u) => u !== uid_temiz)];
          return yeni.slice(0, 10);
        });
      }
    } catch (err) {
      setHata(`Sorgu hatası: ${err.message || err}`);
      setAgac(null);
      setSecili(null);
    } finally {
      setYukleniyor(false);
    }
  }, [uid, python]);

  const temizle = () => {
    setUid("");
    setAgac(null);
    setSecili(null);
    setHata(null);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") sorgula();
    if (e.key === "Escape") temizle();
  };

  // ── Render ──
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>

      {/* ═══ Üst Bar: Başlık + Arama ═══ */}
      <div style={{
        background: "#0d1117",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        flexShrink: 0,
      }}>
        {/* Başlık satırı */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{
              margin: 0, fontSize: 16, fontWeight: 700,
              color: "#f1f5f9",
              fontFamily: "'Orbitron', sans-serif",
              letterSpacing: "0.04em",
            }}>
              BARKOD SORGULA
            </h2>
            <p style={{
              margin: "2px 0 0", fontSize: 12, color: "#475569",
            }}>
              UID ile palet / kutu / ürün ağacını görüntüle
            </p>
          </div>

          {/* Sorgu sayacı */}
          {gecmis.length > 0 && (
            <span style={{
              fontSize: 10, color: "#475569",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {gecmis.length} sorgu
            </span>
          )}
        </div>

        {/* Arama çubuğu */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center",
            background: "#161b22",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            padding: "0 12px",
            transition: "border-color 0.2s",
          }}>
            <Search size={15} color="#475569" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="UID giriniz (örn: 21035128099, P001234, K005678)..."
              style={{
                flex: 1,
                background: "none",
                border: "none",
                outline: "none",
                color: "#e2e8f0",
                fontSize: 13,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                padding: "10px 10px",
              }}
            />
            {uid && (
              <button
                onClick={temizle}
                style={{
                  background: "none", border: "none",
                  color: "#475569", cursor: "pointer",
                  display: "flex", padding: 2,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            onClick={() => sorgula()}
            disabled={yukleniyor || !uid.trim()}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px",
              background: yukleniyor ? "#1e293b" : "#7c3aed",
              border: "none", borderRadius: 8,
              color: "#fff", fontSize: 12, fontWeight: 600,
              cursor: yukleniyor ? "wait" : "pointer",
              opacity: (!uid.trim() && !yukleniyor) ? 0.4 : 1,
              transition: "all 0.2s",
              fontFamily: "'Rajdhani', sans-serif",
              letterSpacing: "0.06em",
              flexShrink: 0,
            }}
          >
            {yukleniyor ? (
              <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <Search size={14} />
            )}
            SORGULA
          </button>

          <button
            onClick={temizle}
            style={{
              display: "flex", alignItems: "center",
              padding: "10px 12px",
              background: "#161b22",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8,
              color: "#64748b", cursor: "pointer",
              flexShrink: 0,
            }}
            title="Temizle (Esc)"
          >
            <X size={14} />
          </button>
        </div>

        {/* Geçmiş sorgu çipleri */}
        {gecmis.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {gecmis.map((g) => (
              <button
                key={g}
                onClick={() => { setUid(g); sorgula(g); }}
                style={{
                  background: "rgba(124, 58, 237, 0.1)",
                  border: "1px solid rgba(124, 58, 237, 0.2)",
                  borderRadius: 5, padding: "3px 8px",
                  color: "#a78bfa", fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(124, 58, 237, 0.2)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(124, 58, 237, 0.1)";
                }}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ═══ Hata Mesajı ═══ */}
      {hata && (
        <div style={{
          margin: "0 20px",
          marginTop: 12,
          padding: "10px 14px",
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: 8,
          display: "flex", alignItems: "center", gap: 8,
          color: "#f87171", fontSize: 12,
          flexShrink: 0,
        }}>
          <AlertCircle size={15} />
          {hata}
        </div>
      )}

      {/* ═══ Ana İçerik: Ağaç + Detay ═══ */}
      <div style={{
        flex: 1,
        display: "flex",
        gap: 0,
        overflow: "hidden",
        minHeight: 0,
      }}>

        {/* Sol: Hiyerarşi Ağacı */}
        <div style={{
          width: "45%",
          minWidth: 280,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          {/* Ağaç başlığı */}
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              color: "#475569",
            }}>
              HİYERARŞİ AĞACI
            </span>
            {agac && (
              <span style={{
                fontSize: 10, color: "#334155",
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {toplamUrun(agac)} ürün
              </span>
            )}
          </div>

          {/* Ağaç içeriği */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
            {agac ? (
              <AgacDugumu
                node={agac}
                seciliUid={secili?.uid}
                onSecim={setSecili}
              />
            ) : (
              <div style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                height: "100%", gap: 8, color: "#1e293b",
              }}>
                <Layers size={40} strokeWidth={1} />
                <span style={{ fontSize: 12, color: "#334155" }}>
                  Sorgu sonucu burada görünecek
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Sağ: Detay Paneli */}
        <div style={{
          flex: 1,
          minWidth: 300,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.04)",
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
              color: "#475569",
            }}>
              DETAY BİLGİSİ
            </span>
          </div>
          <DetayPaneli node={secili} agac={agac} onSecim={setSecili} onSorgula={sorgula} />
        </div>
      </div>

      {/* ═══ Spin animasyonu ═══ */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
