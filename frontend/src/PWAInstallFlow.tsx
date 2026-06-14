import { useState, useEffect, useRef } from "react";

// ── Device detection ────────────────────────────────────────────

function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}

function isInStandaloneMode(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function isMobile(): boolean {
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

// ── Component ───────────────────────────────────────────────────

interface PWAInstallFlowProps {
  userName: string;
  gender?: string;
  testUserType?: string | null;
  onComplete: () => void;
}

function isInAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|LinkedInApp|Line\//i.test(navigator.userAgent);
}

export default function PWAInstallFlow({ userName, gender, testUserType, onComplete }: PWAInstallFlowProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installing, setInstalling] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);
  const promptRef = useRef<any>(null);
  const inApp = isInAppBrowser();

  // If already standalone — skip immediately
  useEffect(() => {
    if (isInStandaloneMode()) {
      onComplete();
      return;
    }

    // Desktop — show welcome text instead of install flow
    if (!isMobile()) {
      setIsDesktop(true);
      requestAnimationFrame(() => setFadeIn(true));
      return;
    }

    // Android / Chrome: capture beforeinstallprompt
    // Check if already captured globally (event may fire before React mounts)
    const w = window as any;
    const grabPrompt = () => {
      if (w.__pwaInstallPrompt && !promptRef.current) {
        promptRef.current = w.__pwaInstallPrompt;
        setDeferredPrompt(w.__pwaInstallPrompt);
      }
    };
    grabPrompt();
    // Retry multiple times — event may fire late depending on browser
    const retryTimer1 = setTimeout(grabPrompt, 500);
    const retryTimer2 = setTimeout(grabPrompt, 1500);
    const retryTimer3 = setTimeout(grabPrompt, 3000);
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e;
      setDeferredPrompt(e);
      w.__pwaInstallPrompt = e;
    };
    window.addEventListener("beforeinstallprompt", handler);

    // iOS detection
    if (isIOS()) {
      setShowIOSGuide(true);
    }

    // Fade in
    requestAnimationFrame(() => setFadeIn(true));

    return () => { clearTimeout(retryTimer1); clearTimeout(retryTimer2); clearTimeout(retryTimer3); window.removeEventListener("beforeinstallprompt", handler); };
  }, []);

  // Android install handler
  async function handleInstall() {
    const prompt = promptRef.current;
    if (!prompt) return;
    setInstalling(true);
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === "accepted") {
      onComplete();
    }
    setInstalling(false);
    setDeferredPrompt(null);
  }

  const isFemale = gender === "woman";
  const isCouple = testUserType === "Couple Tester";

  // Desktop: welcome text (like the old screen, without install instructions)
  if (isDesktop) {
    return (
      <div dir="rtl" style={{
        maxWidth: 520, margin: "0 auto", padding: "40px 20px",
        opacity: fadeIn ? 1 : 0, transition: "opacity 0.6s ease",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="/roundLogo.png" alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", marginBottom: 12, display: "block", margin: "0 auto 12px" }} />
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#1a1a2e", marginBottom: 0 }}>
            {userName ? `${userName}, ` : ""}{isFemale ? "ברוכה הבאה" : "ברוכים הבאים"} ל-One
          </h2>
        </div>
        <div style={{ background: "#f8f9fa", borderRadius: 12, padding: 24, marginBottom: 20, lineHeight: 1.8, fontSize: 15, color: "#333" }}>
          {isCouple ? (
            <>
              <p style={{ marginTop: 0 }}>
                <strong>One</strong> היא מערכת שידוכים חכמה שמתאימה בין אנשים ברמה עמוקה — על בסיס ניתוח אישיותי העולה מהיכרות באמצעות שיחה עם צ'אט AI.
              </p>
              <p>
                אנחנו כרגע בשלבי אימון המערכת על זוגות אמיתיים, כך שתלמד לדייק התאמות עבור משתמשים אמיתיים בהמשך ולמצוא מה באמת מחבר בין זוגות.
              </p>
              <p>
                כל מה ש{isFemale ? "תספרי נשאר חסוי לחלוטין ולעיני ה-AI בלבד. ככל שתעני" : "תספר נשאר חסוי לחלוטין ולעיני ה-AI בלבד. ככל שתענה"} בצורה כנה ופתוחה יותר - נוכל לדייק יותר את התוצאות.
              </p>
              <p>
                בסיום התהליך - נוכל להציג לך תובנות על עצמך ועל הזוגיות שלך :)
              </p>
            </>
          ) : (
            <>
              <p style={{ marginTop: 0 }}>
                <strong>One</strong> היא מערכת שידוכים חכמה שמתאימה בין אנשים ברמה עמוקה — בלי החלקות, בלי שיפוטיות חיצונית.
              </p>
              <p>
                המערכת תכיר אותך באמצעות שיחה שוטפת עם צ'אט AI.
              </p>
              <p>
                כל מה ש{isFemale ? "תספרי נשאר חסוי לחלוטין ולא מופיע בפרופיל. ככל שתהיי יותר כנה ופתוחה" : "תספר נשאר חסוי לחלוטין ולא מופיע בפרופיל. ככל שתהיה יותר כן ופתוח"}, כך ההתאמה תהיה מדויקת יותר.
              </p>
            </>
          )}
        </div>
        <button
          style={{ width: "100%", padding: 16, fontSize: 17, fontWeight: 600, background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.35)" }}
          onClick={onComplete}
        >
          להמשיך לאפליקציה
        </button>
      </div>
    );
  }

  // ── In-app browser: show "open in external browser" instructions ──
  if (inApp) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}>
        <div style={{ maxWidth: 360, width: "100%", textAlign: "center", direction: "rtl" }}>
          <img src="/roundLogo.png" alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>התקינו את One</h2>
          <p style={{ fontSize: 14, color: "#888", margin: "0 0 24px", lineHeight: 1.6 }}>
            כדי להתקין את האפליקציה, יש לפתוח את הלינק בדפדפן הרגיל של הטלפון
          </p>

          <div style={{
            background: "#1a1a2e", borderRadius: 16, padding: "20px 20px",
            textAlign: "right", marginBottom: 28,
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#fff", margin: "0 0 12px" }}>כך עושים את זה:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#8b7ba8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.6 }}>
                  {isFemale ? "לחצי" : "לחץ"} על <strong>⋯</strong> (שלוש נקודות) בחלק העליון של המסך
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#8b7ba8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.6 }}>
                  {isFemale ? "בחרי" : "בחר"} <strong>"Open in external browser"</strong>
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#8b7ba8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</span>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", margin: 0, lineHeight: 1.6 }}>
                  שם {isFemale ? "תוכלי" : "תוכל"} להתקין את האפליקציה בקלות
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={onComplete}
            style={{
              background: "none", border: "none", color: "#aaa",
              fontSize: 13, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {isFemale ? "המשיכי" : "המשך"} בינתיים בלי התקנה →
          </button>
        </div>
      </div>
    );
  }

  // ── Normal browser: styled install screen ──
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)" }}>
      <div style={{ maxWidth: 360, width: "100%", textAlign: "center", direction: "rtl" }}>
        <img src="/roundLogo.png" alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover", marginBottom: 16 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e", margin: "0 0 8px" }}>
          {userName ? `${userName}, ` : ""}{isFemale ? "ברוכה הבאה" : "ברוכים הבאים"} ל-One
        </h2>
        <p style={{ fontSize: 14, color: "#888", margin: "0 0 28px", lineHeight: 1.6 }}>
          כדי ליהנות מהחוויה המלאה, המהירה והנוחה ביותר (עוד לפני שאנחנו נוחתים בחנויות האפליקציות), אנחנו ממליצים להוסיף את One למסך הבית שלך.
        </p>

        {/* Android: Native install button */}
        {deferredPrompt && !showIOSGuide && (
          <button
            onClick={handleInstall}
            disabled={installing}
            style={{
              width: "100%",
              padding: "14px 24px",
              fontSize: 16,
              fontWeight: 600,
              background: "#1a1a2e",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              cursor: "pointer",
              fontFamily: "inherit",
              marginBottom: 20,
              opacity: installing ? 0.7 : 1,
            }}
          >
            {installing ? "מתקין..." : "התקן עכשיו"}
          </button>
        )}

        {/* iOS: Safari instructions */}
        {showIOSGuide && (
          <div style={{
            background: "#f5f0fb", borderRadius: 16, padding: "20px 20px",
            textAlign: "right", marginBottom: 20,
          }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a2e", margin: "0 0 12px" }}>להתקנה:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#8b7ba8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
                <p style={{ fontSize: 13, color: "#555", margin: 0, lineHeight: 1.6 }}>
                  {isFemale ? "לחצי" : "לחץ"} על כפתור השיתוף <ShareIcon /> בתחתית המסך
                </p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#8b7ba8", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
                <p style={{ fontSize: 13, color: "#555", margin: 0, lineHeight: 1.6 }}>
                  {isFemale ? "גללי" : "גלול"} למטה {isFemale ? "ובחרי" : "ובחר"} <strong>"Add to Home Screen"</strong> <PlusSquareIcon />
                </p>
              </div>
            </div>
          </div>
        )}

        {/* No prompt available — generic */}
        {!deferredPrompt && !showIOSGuide && (
          <div style={{
            background: "#f5f0fb", borderRadius: 16, padding: "16px 20px",
            marginBottom: 20,
          }}>
            <p style={{ margin: 0, fontSize: 14, color: "#666", textAlign: "center", lineHeight: 1.6 }}>
              {isFemale
                ? "ניתן להוסיף את האתר למסך הבית דרך תפריט הדפדפן"
                : "ניתן להוסיף את האתר למסך הבית דרך תפריט הדפדפן"}
            </p>
          </div>
        )}

        <button
          onClick={onComplete}
          style={{
            background: "none", border: "none", color: "#aaa",
            fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          {isFemale ? "המשיכי" : "המשך"} בדפדפן →
        </button>

        <p style={{ fontSize: 11, color: "#ccc", marginTop: 24 }}>
          100% פרטי ומאובטח. הנתונים שלך לעיני ה-AI בלבד.
        </p>
      </div>
    </div>
  );
}

// ── Feature row ─────────────────────────────────────────────────

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={s.featureRow}>
      <span style={s.featureIcon}>{icon}</span>
      <span style={s.featureText}>{text}</span>
    </div>
  );
}

// ── SVG Icons ───────────────────────────────────────────────────

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  );
}

// ── Bounce animation ────────────────────────────────────────────

const bounceKeyframes = `
@keyframes pwa-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(8px); }
}
`;

// ── Styles ──────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    background: "#fff",
    direction: "rtl",
    position: "relative",
    overflow: "hidden",
    transition: "opacity 0.6s ease, transform 0.6s ease",
  },
  glowOrb: {
    position: "absolute",
    top: "-80px",
    right: "-80px",
    width: 260,
    height: 260,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  glowOrb2: {
    position: "absolute",
    bottom: "-60px",
    left: "-60px",
    width: 200,
    height: 200,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  logoWrap: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    overflow: "hidden",
    boxShadow: "0 4px 20px rgba(99,102,241,0.2)",
    marginBottom: 24,
    alignSelf: "center",
  },
  logo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  heading: {
    fontSize: 26,
    fontWeight: 700,
    color: "#1a1a2e",
    margin: "0 0 8px",
    textAlign: "center",
  },
  subheading: {
    fontSize: 15,
    color: "#666",
    margin: "0 0 28px",
    textAlign: "center",
    lineHeight: 1.5,
    maxWidth: 320,
  },
  features: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    marginBottom: 32,
    width: "100%",
    maxWidth: 320,
  },
  featureRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#f8f9fb",
    borderRadius: 12,
    padding: "12px 16px",
  },
  featureIcon: {
    fontSize: 20,
    flexShrink: 0,
  },
  featureText: {
    fontSize: 14,
    color: "#333",
    fontWeight: 500,
  },
  installBtn: {
    width: "100%",
    maxWidth: 320,
    padding: "16px 24px",
    fontSize: 17,
    fontWeight: 700,
    color: "#fff",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    border: "none",
    borderRadius: 14,
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(99,102,241,0.35)",
    marginBottom: 16,
    transition: "opacity 0.2s, transform 0.15s",
  },
  iosCard: {
    width: "100%",
    maxWidth: 320,
    background: "#f8f9fb",
    borderRadius: 16,
    padding: "20px 20px 12px",
    marginBottom: 16,
    position: "relative",
  },
  iosTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: "#1a1a2e",
    margin: "0 0 16px",
    textAlign: "center",
  },
  iosStep: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  iosStepNum: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    background: "#6366f1",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  iosStepText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 1.5,
  },
  iosIcon: {
    display: "inline-flex",
    alignItems: "center",
    marginRight: 4,
    marginLeft: 4,
  },
  arrowWrap: {
    display: "flex",
    justifyContent: "center",
    marginTop: 8,
  },
  bouncingArrow: {
    fontSize: 24,
    color: "#6366f1",
    animation: "pwa-bounce 1.2s ease-in-out infinite",
    opacity: 0.7,
  },
  genericCard: {
    width: "100%",
    maxWidth: 320,
    background: "#f8f9fb",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  skipBtn: {
    background: "none",
    border: "none",
    color: "#888",
    fontSize: 14,
    cursor: "pointer",
    padding: "8px 16px",
    marginTop: 4,
    transition: "color 0.2s",
  },
  trustText: {
    fontSize: 11,
    color: "#bbb",
    marginTop: 16,
    textAlign: "center",
  },
};
