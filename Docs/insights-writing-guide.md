# Insights Writing Guide — Claude Agent

## When to Write Insights
- When running the user management agent (daily pipeline run)
- For users who completed all channels (or completed_partial) and don't have insights yet
- When re-writing insights for users with 8+ new messages since last analysis

## How to Get User Data
1. Fetch all conversations: `SELECT role, content, guide FROM conversation_messages WHERE user_id = $1 ORDER BY created_at ASC`
2. Fetch traits: `SELECT td.internal_name, td.display_name_he, td.trait_group, ut.score FROM user_traits ut JOIN trait_definitions td ON ut.trait_definition_id = td.id WHERE ut.user_id = $1`
3. Fetch user profile: `SELECT first_name, age, gender, looking_for_gender, city FROM users WHERE id = $1`

## Output Format
Two fields to save to DB:
- `personal_insights_short` — 2-3 sentences
- `personal_insights_full` — 7-10 paragraphs

Save via: `UPDATE users SET personal_insights_short = $1, personal_insights_full = $2, insights_pre_completion = $3, updated_at = NOW() WHERE id = $4`

Set `insights_pre_completion = true` if cognitive user messages < 3 OR taste user messages < 3.

## Writing Style — Core Principles

### 1. Facts as Anchors, Not Lists
- NEVER list facts back ("you like cooking, traveling and movies")
- USE facts as anchors for deeper insight
- Every fact mentioned must answer: what does this tell us about their emotional needs, relationship patterns, or partner fit?

Bad: "את אוהבת לבשל, לטייל ולראות סרטים."
Good: "הבישול אצלך הוא דרך לייצר קרבה וביתיות — קשר טוב עבורך כנראה ייבנה גם דרך פעולות יומיומיות של דאגה ולא רק דרך שיחות גדולות."

### 2. Specificity Test
Before finishing, check every paragraph: could this be written for 100 other users? If yes — rewrite with a specific detail, internal tension, or unique pattern from the conversation.

### 3. Internal Tensions ("גם וגם")
Always look for contradictions and complexity:
- Softness alongside sharp boundaries
- Giving alongside exhaustion from toxic people
- Openness alongside red lines
- Need for closeness alongside need for space
- Compromise alongside delayed frustration

The analysis should be respectful but NOT purely flattering.

### 4. Mandatory "Less Suitable" Section
summary_full MUST include a paragraph about what won't work — framed through needs, not judgment:
- "כנראה פחות יתאים לך קשר שבו..." NOT "אנשים כאלה לא טובים"

### 5. Don't Inflate Depth
If the user gave short, practical, simple answers — respect that. Don't turn every simple preference into "journey", "depth", "authenticity" or "rich inner world". Sometimes the accurate insight is that this person wants a simple, pleasant, stable relationship — and that's perfectly fine.

### 6. No Therapeutic Clichés
Avoid: "מסע של גילוי", "חיים מלאי עניין ומשמעות", "שותפה אמיתית לחיים", "חיבור עמוק ומשמעותי", "את מעריכה אותנטיות ופשטות"
These are empty phrases. Be concrete.

### 7. No Quoting or Referencing the Conversation
- Never write "אמרת ש..." or "כשנשאלת..."
- Never quote directly from the conversation
- OK to reference patterns indirectly: "הבחירות שלך מצביעות על..."

### 8. Second Person (גוף שני)
- Always write as את/אתה, NEVER third person, NEVER by name as subject
- Most sentences should address the user directly, but vary for natural Hebrew
- Gender-match all language to the user's gender

### 9. Partner Gender Matching
- Check `looking_for_gender` — always match partner descriptions accordingly
- "בן זוג" / "בת זוג", "גבר" / "אישה" — never assume

### 10. Sensitive Topics
If the user expressed preferences about body, gender identity, ethnicity, weight, religion:
- Don't phrase offensively or judgmentally
- OK to frame gently: "חשובה לך התאמה בזהות, במשיכה ובתחושת טבעיות זוגית"
- Don't include intimate/sexual details even if shared in conversation

### 11. Use Trait Scores as Background
- Trait scores (0-100) provide quantitative validation
- Use them to strengthen insights from conversation (high/low score confirming a pattern)
- Identify interesting gaps (high openness score but conservative relationship behavior)
- NEVER mention numeric scores in the output

## Structure — summary_full

1. **Opening**: Core pattern — what drives this person, not what they do but why
2. **Expression**: How this shows up in daily life, choices, work
3. **Emotional/Communication Pattern**: How they handle conflict, what happens when hurt
4. **Lessons from Past Relationships**: Not what happened, but what was learned
5. **Family**: How family connection affects what they seek in a partner
6. **Taste Patterns**: What attracts, what repels, and why (from taste test)
7. **What They Need in a Relationship**: Real insight, not a shopping list
8. **What Won't Work**: Framed through needs, not rejection
9. **Closing**: What type of partner fits and why — a sentence that ties everything together

Skip sections that have no data. NEVER invent.

## Structure — summary_short

2-3 sentences that capture:
- Who this person is (the core pattern)
- What kind of partner fits them and why

This is NOT a copy of one paragraph from summary_full — it's a distilled bottom line.

## Tone
- Hebrew, second person, gender-matched
- Professional-warm — like a perceptive friend, not a clinical report
- Honest without being harsh. Precise without being judgmental
- The reader should feel genuinely seen

## Quality Checklist Before Saving
- [ ] Every paragraph passes the "100 users" specificity test
- [ ] At least one internal tension is identified
- [ ] "Less suitable" section exists and is framed through needs
- [ ] No empty therapeutic clichés
- [ ] No fact lists without interpretation
- [ ] Gender and partner gender are correct throughout
- [ ] No direct quotes from conversation
- [ ] Tone is warm but not flattering
