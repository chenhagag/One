# Insights Icons Brief — 6 אייקונים למסך תובנות

## סגנון כללי (חובה לכל האייקונים)

**Reference**: הצמד 2-3 אייקונים קיימים כ-reference — למשל home.png, settings.png, thinkingType.png

**Prompt base** (להוסיף לכל prompt):
> Minimalist icon, hand-drawn brush stroke style, black ink strokes with soft lavender/light purple (#b9a4d4) accents. Transparent background. No fill background. Artistic, organic lines — not geometric or clean-cut. Similar style to the attached reference icons. Square aspect ratio, suitable for 28px display size. PNG format.

---

## 1. MBTI — טיפוס אישיות

**מייצג**: 16 טיפוסי MBTI, ממדי אישיות (E/I, S/N, T/F, J/P)

**Prompt**:
> [base style] Icon representing personality typology / MBTI. Concept: four interconnected letters or four quadrants forming a personality matrix. Could show 4 small squares or cells arranged in a 2x2 grid with brush strokes, with one cell highlighted in lavender. Or: the silhouette of a head in profile with 4 small symbols/dots inside representing different dimensions.

**חלופה**: פרופיל ראש עם 4 חלוקות פנימיות, או מטריצה 2×2 בסגנון brush

---

## 2. ערכים (שוורץ) — Schwartz Values

**מייצג**: 11 ערכי שוורץ (הישגיות, נדיבות, ביטחון, עצמאות, מסורת...)

**Prompt**:
> [base style] Icon representing core personal values / moral compass. Concept: a compass rose with brush strokes, the needle in lavender. Or: a diamond/gem shape drawn with bold black brush strokes with a lavender glow or inner sparkle. Or: a heart with a compass needle inside it.

**חלופה**: יהלום/gem בסגנון brush (מתקשר ל-💎 הקיים), או מצפן ערכי

---

## 3. Big Five — תכונות אישיות

**מייצג**: 5 תכונות (מוחצנות, מצפוניות, נעימות, פתיחות, נוירוטיות)

**Prompt**:
> [base style] Icon representing the Big Five personality traits — five dimensions of personality. Concept: five brush stroke petals arranged in a flower/star pattern around a center point, alternating black and lavender. Or: a hand with five fingers spread, drawn in brush strokes with lavender accents. Or: a pentagon/star shape with 5 points, each point a thick brush stroke.

**חלופה**: כוכב/פרח עם 5 עלים — 3 שחור + 2 סגול, או יד פתוחה

---

## 4. אניאגרם — Enneagram

**מייצג**: 9 טיפוסי אניאגרם, סמל האניאגרם (עיגול + משולש + hexad)

**Prompt**:
> [base style] Icon representing the Enneagram personality system. Concept: the classic enneagram symbol — a circle with an inner triangle and connecting lines, drawn in black brush strokes with the circle or triangle partially in lavender. Keep the recognizable enneagram shape but render it in organic brush stroke style, not geometric.

**הערה**: יש כבר Anigram.png אבל הוא גיאומטרי מדי. צריך אותו דבר בסגנון brush stroke אורגני

---

## 5. סגנון התקשרות — Attachment Style

**מייצג**: 3 סגנונות (בטוח, חרדתי, נמנע) — איך אדם מתקשר רגשית בזוגיות

**Prompt**:
> [base style] Icon representing attachment style / emotional bonding. Concept: two interlinked circles or chain links drawn in brush strokes — one black, one lavender — representing connection between people. Or: two abstract human figures leaning toward each other, connected by a lavender arc/bridge. Or: an anchor shape in brush strokes with lavender rope.

**חלופה**: שני עיגולים שלובים (שחור + סגול), או עוגן עם חבל

---

## 6. ניתוח מלא — Full Analysis

**מייצג**: תמונה כוללת של כל הפרופיל — סיכום מקיף

**Prompt**:
> [base style] Icon representing a complete analysis / full profile overview. Concept: a clipboard or document with brush stroke lines suggesting text, with a lavender checkmark or magnifying glass. Or: an open book with brush strokes, pages fanning out, with lavender highlights. Or: a circular radar/spider chart outline in brush strokes with lavender fill on some axes.

**חלופה**: לוח עם ✓ סגול, או ספר פתוח, או radar chart מינימלי

---

## הנחיות טכניות

- **פורמט**: PNG, רקע שקוף
- **מידות**: 512×512px (ירד ל-28px בתצוגה)
- **צבעים**: שחור (#1a1a2e) + סגול בהיר (#b9a4d4) בלבד
- **שמות קבצים**: `insights-mbti.png`, `insights-values.png`, `insights-bigfive.png`, `insights-enneagram.png`, `insights-attachment.png`, `insights-fullanalysis.png`
- **תיקיית יעד**: `frontend/public/icons/`
- **בדיקה**: לוודא שנראה טוב גם ב-28px וגם ב-dark mode (רקע כהה)
