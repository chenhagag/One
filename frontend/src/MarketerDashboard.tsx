import { useState, useEffect } from "react";
import { apiFetch } from "./lib/api";

interface MarketerDashboardProps {
  userEmail: string;
  onBack: () => void;
  endpoint: string;
  title: string;
  linkLabel: string;
}

interface DayData {
  date: string;
  visits: number;
  registrations: number;
}

interface Registration {
  id: number;
  first_name: string;
  created_at: string;
}

interface DashboardData {
  total_registered: number;
  started_chat: number;
  in_pool: number;
  landing_visits_total: number;
  by_day: DayData[];
  available_months?: string[];
  registrations?: Registration[];
}

export default function MarketerDashboard({ userEmail, onBack, endpoint, title, linkLabel }: MarketerDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  function loadData(month: string | null) {
    setLoading(true);
    const url = month ? `${endpoint}?month=${month}` : endpoint;
    apiFetch(url)
      .then(r => {
        if (!r.ok) throw new Error("אין גישה");
        return r.json();
      })
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadData(null); }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f7fc" }}>
        <p style={{ color: "#888" }}>טוען...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#f8f7fc" }}>
        <p style={{ color: "#ef4444", fontSize: 16 }}>{error || "שגיאה"}</p>
        <button onClick={onBack} style={{ marginTop: 16, fontSize: 14, color: "#8b7ba8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>חזרה</button>
      </div>
    );
  }

  const maxVal = Math.max(...data.by_day.map(d => Math.max(d.visits, d.registrations)), 1);

  return (
    <div style={{
      minHeight: "100dvh", background: "#f8f7fc",
      padding: "env(safe-area-inset-top, 0px) 0 24px",
    }}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 20px" }} dir="rtl">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a2e", margin: "0 0 4px" }}>{title}</h1>
            <p style={{ fontSize: 13, color: "#8b7ba8", margin: 0 }}>לינק: {linkLabel}</p>
          </div>
          <button onClick={onBack} style={{
            padding: "8px 16px", fontSize: 13, background: "#1a1a2e", color: "#fff",
            border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
          }}>חזרה</button>
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <StatCard label="ביקורים בלינק" value={data.landing_visits_total} color="#8b7ba8" />
          <StatCard label="נרשמו" value={data.total_registered} color="#6366f1" />
          <StatCard label="התחילו שיחה" value={data.started_chat} color="#3b82f6" />
          <StatCard label="במאגר" value={data.in_pool} color="#10b981" />
        </div>

        {/* Month picker */}
        {data.available_months && data.available_months.length > 0 && (() => {
          const currentMonth = new Date().toISOString().slice(0, 7);
          const pastMonths = data.available_months!.filter(m => m < currentMonth);
          if (pastMonths.length === 0) return null;
          const hebrewMonth = (m: string) => {
            const [y, mo] = m.split("-");
            const names = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
            return `${names[parseInt(mo, 10) - 1]} ${y}`;
          };
          return (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#8b7ba8" }}>תקופה:</span>
              <button onClick={() => { setSelectedMonth(null); loadData(null); }} style={{
                padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                border: !selectedMonth ? "2px solid #6366f1" : "1px solid #e2e8f0",
                background: !selectedMonth ? "#eef2ff" : "#fff",
                color: !selectedMonth ? "#6366f1" : "#888",
                fontWeight: !selectedMonth ? 700 : 400,
              }}>30 יום אחרונים</button>
              {pastMonths.map(m => (
                <button key={m} onClick={() => { setSelectedMonth(m); loadData(m); }} style={{
                  padding: "4px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
                  border: selectedMonth === m ? "2px solid #6366f1" : "1px solid #e2e8f0",
                  background: selectedMonth === m ? "#eef2ff" : "#fff",
                  color: selectedMonth === m ? "#6366f1" : "#888",
                  fontWeight: selectedMonth === m ? 700 : 400,
                }}>{hebrewMonth(m)}</button>
              ))}
            </div>
          );
        })()}

        {/* Chart */}
        <div style={{
          background: "#fff", borderRadius: 18, padding: "20px 20px 16px",
          boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
        }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 16px" }}>
            {selectedMonth || "30 יום אחרונים"}
          </h3>

          {/* Legend */}
          <div style={{ display: "flex", gap: 16, marginBottom: 12, fontSize: 12, color: "#888" }}>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#c4b5fd", marginLeft: 4 }} />ביקורים</span>
            <span><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: "#6366f1", marginLeft: 4 }} />הרשמות</span>
          </div>

          {/* Bar chart */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 140, direction: "ltr" }}>
            {data.by_day.map((d, i) => {
              const vH = (d.visits / maxVal) * 120;
              const rH = (d.registrations / maxVal) * 120;
              const dayLabel = new Date(d.date).getDate().toString();
              const isToday = i === data.by_day.length - 1;
              return (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }} title={`${d.date}: ${d.visits} ביקורים, ${d.registrations} הרשמות`}>
                  <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 120 }}>
                    <div style={{ width: "50%", height: Math.max(vH, d.visits > 0 ? 3 : 0), background: "#c4b5fd", borderRadius: "2px 2px 0 0", transition: "height 0.3s" }} />
                    <div style={{ width: "50%", height: Math.max(rH, d.registrations > 0 ? 3 : 0), background: "#6366f1", borderRadius: "2px 2px 0 0", transition: "height 0.3s" }} />
                  </div>
                  {(i % 5 === 0 || isToday) && (
                    <span style={{ fontSize: 9, color: isToday ? "#6366f1" : "#bbb", marginTop: 4, fontWeight: isToday ? 700 : 400 }}>{dayLabel}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Day totals table */}
          {data.by_day.some(d => d.visits > 0 || d.registrations > 0) && (
            <div style={{ marginTop: 16, borderTop: "1px solid #f0eef5", paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: "#888", marginBottom: 8 }}>ימים עם פעילות:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                {data.by_day.filter(d => d.visits > 0 || d.registrations > 0).reverse().map(d => {
                  const dateStr = new Date(d.date).toLocaleDateString("he-IL", { day: "numeric", month: "short" });
                  return (
                    <div key={d.date} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#555", padding: "2px 0" }}>
                      <span>{dateStr}</span>
                      <span>
                        {d.visits > 0 && <span style={{ color: "#8b7ba8" }}>{d.visits} ביקורים</span>}
                        {d.visits > 0 && d.registrations > 0 && " · "}
                        {d.registrations > 0 && <span style={{ color: "#6366f1", fontWeight: 600 }}>{d.registrations} הרשמות</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Registrations detail table */}
        {data.registrations && data.registrations.length > 0 && (
          <div style={{
            background: "#fff", borderRadius: 18, padding: "20px 20px 16px",
            boxShadow: "0 2px 12px rgba(139,123,168,0.08)", marginTop: 16,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a2e", margin: "0 0 12px" }}>
              פירוט הרשמות ({data.registrations.length})
            </h3>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #f0eef5" }}>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#8b7ba8", fontWeight: 600 }}>#</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#8b7ba8", fontWeight: 600 }}>שם</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#8b7ba8", fontWeight: 600 }}>תאריך</th>
                    <th style={{ textAlign: "right", padding: "6px 8px", color: "#8b7ba8", fontWeight: 600 }}>שעה</th>
                  </tr>
                </thead>
                <tbody>
                  {data.registrations.map((r, i) => {
                    const dt = new Date(r.created_at);
                    return (
                      <tr key={r.id} style={{ borderBottom: "1px solid #f8f7fc" }}>
                        <td style={{ padding: "5px 8px", color: "#bbb" }}>{i + 1}</td>
                        <td style={{ padding: "5px 8px", color: "#1a1a2e", fontWeight: 500 }}>{r.first_name || "—"}</td>
                        <td style={{ padding: "5px 8px", color: "#555" }}>{dt.toLocaleDateString("he-IL", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td style={{ padding: "5px 8px", color: "#555" }}>{dt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      background: "#fff", borderRadius: 16, padding: "18px 20px",
      boxShadow: "0 2px 12px rgba(139,123,168,0.08)",
      textAlign: "center",
    }}>
      <div style={{ fontSize: 32, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#888", marginTop: 6 }}>{label}</div>
    </div>
  );
}
