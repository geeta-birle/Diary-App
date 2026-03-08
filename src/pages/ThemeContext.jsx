import { createContext, useContext, useState, useEffect } from "react";

export const THEMES = [
  { id: "soft-pastel",   label: "Soft Pastel",   icon: "🌸", preview: ["#fdf6f0","#fff9f5","#e07b54"] },
  { id: "dark-journal",  label: "Dark Journal",  icon: "🌙", preview: ["#0f0e0c","#1a1816","#c9a96e"] },
  { id: "minimal-white", label: "Minimal White", icon: "⬜", preview: ["#ffffff","#f9f9f9","#111111"] },
  { id: "vintage-paper", label: "Vintage Paper", icon: "📜", preview: ["#f4efe6","#faf6ed","#8b6914"] },
];

const VALID_THEMES = THEMES.map((t) => t.id);

function applyTheme(t) {
  const safe = VALID_THEMES.includes(t) ? t : "soft-pastel";
  document.documentElement.setAttribute("data-theme", safe);
  return safe;
}

const ThemeContext = createContext({ theme: "soft-pastel", setTheme: () => {} });
export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    const saved = localStorage.getItem("diary_theme") || "soft-pastel";
    return applyTheme(saved);
  });

  const setTheme = (t) => {
    const safe = applyTheme(t);
    localStorage.setItem("diary_theme", safe);
    setThemeState(safe);
  };

  useEffect(() => { applyTheme(theme); }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div className="ts-wrap">
      <button className="ts-trigger" onClick={() => setOpen((o) => !o)} title="Change theme">🎨</button>
      {open && (
        <>
          <div className="ts-backdrop" onClick={() => setOpen(false)} />
          <div className="ts-panel">
            <p className="ts-title">Theme</p>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`ts-option ${theme === t.id ? "ts-active" : ""}`}
                onClick={() => { setTheme(t.id); setOpen(false); }}
              >
                <div className="ts-swatch">
                  {t.preview.map((c, i) => (
                    <span key={i} style={{
                      background: c, flex: 1, height: "100%",
                      borderRadius: i === 0 ? "3px 0 0 3px" : i === 2 ? "0 3px 3px 0" : "",
                    }} />
                  ))}
                </div>
                <span className="ts-icon">{t.icon}</span>
                <span className="ts-label">{t.label}</span>
                {theme === t.id && <span className="ts-check">✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}