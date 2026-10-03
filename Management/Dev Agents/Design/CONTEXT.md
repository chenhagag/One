# Design Agent — Context

## Role
אחראי על שפה עיצובית, UX patterns, brand identity, ומבנה מסכים. מגדיר את ה-look & feel — סוכן Frontend משתמש בתוצרים שלו בקוד.

---

## Brand Identity

### שם וזהות
- **שם**: One
- **תגלית**: "meet, as you are."
- **דומיין**: joinone.io
- **קהל יעד נוכחי**: WW (נשים מחפשות נשים)
- **Brand Guide**: `Management/Dev Agents/Design/ONE_Brand_Guide_final.docx`

### לוגו ואייקונים
- תיקיית assets: `Management/Dev Agents/Design/cut/`
- לוגואים: `cut/logos/` — גרסאות שונות (שקוף, לבן, שחור, עגול, עם רקע)
- אייקונים: `cut/Icons/` + `cut/Icons/Transparent/` — אייקוני ניווט ופיצ'רים

---

## Color Palette

### צבעי מותג ראשיים
| שימוש | צבע | HEX |
|-------|------|-----|
| **Primary / CTA** | סגול | `#7b5fa3` |
| **Primary dark** | סגול כהה | `#5b21b6` |
| **Primary vivid** | סגול חי | `#7c3aed` |
| **Primary light bg** | סגול בהיר | `#f5f3ff` |
| **Primary border** | סגול בורדר | `#c4b5fd` |
| **Accent** | ורוד | `#ec4899` |

### צבעי סטטוס
| סטטוס | צבע | HEX |
|--------|------|-----|
| Success / active | ירוק | `#16a34a` / `#059669` |
| Warning / in-process | כתום | `#d97706` |
| Error / rejected | אדום | `#dc2626` |
| Neutral / secondary | אפור | `#64748b` / `#94a3b8` |
| Info | כחול | `#0ea5e9` |

### צבעי טקסט
| שימוש | HEX |
|-------|-----|
| כותרות / שמות | `#1e1b4b` (navy כהה) |
| גוף טקסט | `#333` |
| טקסט משני | `#64748b` |
| טקסט מעומעם | `#94a3b8` |

---

## Typography

### אפליקציה (Frontend)
- **כללי**: System fonts — Arial, sans-serif
- **RTL**: כל הטקסט בעברית, direction: rtl

### חומרי שיווק (Instagram Posts)
- **כותרות**: Cormorant Garamond (serif, elegant)
- **גוף**: Heebo (sans-serif, נקי)
- **Footer**: JetBrains Mono (monospace, מודרני)

---

## Design Patterns

### Frosted Glass Cards (Onboarding)
- שימוש ב-`backdrop-filter: blur()` עם רקע תמונה
- ProfileSetup, ConsentScreen, CoupleWelcome — שפה אחידה
- כרטיסים עם רקע שקוף-חלקי, borders עדינים, צללים רכים

### Inline Styles
- **הפרויקט לא משתמש ב-CSS files** — הכל inline styles ב-React
- אין Tailwind, אין styled-components, אין CSS modules
- Styles מוגדרים כ-objects או ישירות ב-`style={{}}`

### Mobile-First
- Sidebar toggle למובייל
- Header עם avatar למובייל
- כפתורים בגודל נגיש (min 44px touch target)

### Admin vs. User
- **User-facing**: מעוצב, סגול, frosted glass, רקעים רכים
- **Admin**: פונקציונלי, טבלאות, badges צבעוניים, minimal styling

---

## Instagram Posts Brand Style
Reference: `Management/Marketing/Posts/square_html_package/carousel.html`

- Fonts: Cormorant Garamond (headlines), Heebo (body), JetBrains Mono (footer)
- Colors: `#15108B` (navy headlines), `#3A3568` (body), alternating backgrounds `#F4F4FC` / `#ECEBFA`, dark slides `#0E0A4D`
- Elements: grain texture overlay, icon_only.png orb (top-right), anchor-line divider, slight headline rotation
- Footer: "One" right + "meet, as you are." left, separated by border-top
- Name colors: נועה=`#8B2E6A`, אריאל=`#1B4FA0`
- Match tags: colored pill badges (green/red/yellow with border)
- Each frame: 1080x1080px

---

## Onboarding Screens Design (2026-09-30)
ProfileSetup, ConsentScreen, CoupleWelcome — redesigned with unified language:
- רקע עם תמונה
- כרטיסים frosted glass
- אינפוטים עם focus סגול
- טיפוגרפיה מותאמת
- כפתור CTA סגול (#7b5fa3) עם border-radius: 10px

---

## Email Design
- Template: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#333;max-width:500px">`
- CTA button: `background-color:#7b5fa3; color:#ffffff; padding:12px 22px; border-radius:999px`
- Footer link: `color:#7b5fa3`
- **בעיה ידועה**: הלוגו שנשלח במיילים לא שקוף — נראה רע על רקע לא לבן

---

## WW-Specific Design
- `isWW` flag triggers feminine UI adaptations
- No gender/height fields in ProfileSetup
- Demo match card in /forwomen landing
- `wwRel()` helper converts masculine Hebrew to feminine via regex

---

## What to Read
1. This file (CONTEXT.md)
2. WORKLOG.md of this agent
3. `Management/Dev Agents/Design/ONE_Brand_Guide_final.docx` — brand guide מקורי
4. `Management/Marketing/Posts/square_html_package/carousel.html` — reference post
5. `Management/claude-working-guidelines.md` — general rules

## Rules
- **Inline styles only** — no CSS files, no Tailwind, no styled-components
- **RTL always** — direction: rtl on all Hebrew content
- **Primary color is #7b5fa3** — all CTAs, focus states, active states
- **Admin UI is functional, not pretty** — don't over-design admin screens
- **Mobile touch targets**: minimum 44px
- **Brand guide is the source of truth** for logo usage and brand identity
