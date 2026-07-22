# Formula Rendering & Competency/Objective Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable accurate rendering of scientific formulas & math exponents (e.g. `H₂O`, `x²`, `10⁵`, `CO₂`) across preview UI and DOCX exports, add an optional Specific Objectives input field, and strictly align AI prompt generation with Learning Competencies and Objectives.

**Architecture:** Create a `formatFormula.ts` utility to sanitize/convert caret notation into standard Unicode super/subscript characters. Update `QuizParams` in `ai.ts` and API handler `route.ts` to accept `competency` and `objective`. Enhance `generateQuizQuestions` system prompt with strict pedagogical alignment and Unicode formatting instructions. Add the optional Objectives field in `page.tsx` sidebar.

**Tech Stack:** Next.js (App Router), React, TypeScript, Zod, Vercel AI SDK.

## Global Constraints
- Next.js 16.2.10 (Turbopack) compatibility
- Retain existing Neumorphic / iOS styling tokens (`neu-flat`, `neu-input`, `neu-button`)
- Clean Unicode output natively supported by both browser and Microsoft Word `.docx` Packer

---

### Task 1: Create Formula Sanitizer Utility (`src/utils/formatFormula.ts`)

**Files:**
- Create: `src/utils/formatFormula.ts`

**Interfaces:**
- Consumes: None
- Produces: `formatFormula(text: string): string`

- [ ] **Step 1: Write `src/utils/formatFormula.ts`**

```typescript
// Helper to convert caret exponent notation and raw formula patterns into Unicode superscripts and subscripts
export function formatFormula(text: string): string {
  if (!text) return text;

  // Convert caret superscripts e.g. x^2 -> x², 10^-3 -> 10⁻³
  const superMap: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'x': 'ˣ'
  };

  let result = text.replace(/\^([0-9+\-=()nx]+)/g, (_, match) => {
    return match.split('').map((char: string) => superMap[char] || char).join('');
  });

  return result;
}
```

- [ ] **Step 2: Commit Task 1**

```bash
git add src/utils/formatFormula.ts
git commit -m "feat: Add formula sanitizer utility for Unicode super/subscript conversion"
```

---

### Task 2: Update AI API Handler & System Prompt (`src/app/api/generate/route.ts` & `ai.ts`)

**Files:**
- Modify: `src/app/api/generate/route.ts`
- Modify: `src/app/api/generate/ai.ts`

**Interfaces:**
- Consumes: `QuizParams` (updated with `competency?: string`, `objective?: string`)
- Produces: `generateQuizQuestions` with strict pedagogical alignment & Unicode formula instructions.

- [ ] **Step 1: Update `QuizParams` and `generateQuizQuestions` prompt in `src/app/api/generate/ai.ts`**

Update `QuizParams`:
```typescript
export interface QuizParams {
  topic: string; 
  competency?: string;
  objective?: string;
  grade: string; 
  subject: string; 
  difficulty: string; 
  type: string; 
  count: number;
}
```

Update prompt in `generateQuizQuestions`:
```typescript
  const prompt = `You are an expert educator. Generate a ${params.type} test with ${params.count} questions.

Target Context:
- Subject: ${params.subject} (${params.grade})
- Topic: ${params.topic}
- Learning Competency: ${params.competency || "Standard curriculum alignment for " + params.topic}
- Specific Objective: ${params.objective || "Standard learning objective for " + params.topic}
- Difficulty Level: ${params.difficulty}

STRICT ALIGNMENT & FORMATTING RULES:
1. Questions MUST directly evaluate the specified Learning Competency and Specific Objective at the appropriate cognitive depth.
2. For all mathematical exponents, powers, or chemical formulas, ALWAYS use standard Unicode superscripts and subscripts (e.g. x², y³, 10⁵, H₂O, CO₂, H₂SO₄, a² + b² = c²).
3. Do NOT use LaTeX ($ or $$) or HTML tags (<sup>/<sub>). Use clean Unicode text only so formulas render natively in Word and browser previews.`;
```

Sanitize question text with `formatFormula`:
```typescript
  return object.questions.map((q: any, i: number) => ({
    id: `q-${Date.now()}-${i}`,
    type: params.type,
    text: formatFormula(q.text),
    options: q.options ? q.options.map((opt: string) => formatFormula(opt)) : undefined,
    correctAnswer: typeof q.correctAnswer === 'number' ? q.correctAnswer : undefined
  }));
```

- [ ] **Step 2: Update `src/app/api/generate/route.ts` to extract `competency` and `objective`**

```typescript
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { topic, competency, objective, grade, subject, type, difficulty, count } = body;

    const questions = await generateQuizQuestions({
      topic,
      competency,
      objective,
      grade,
      subject,
      type,
      difficulty,
      count: parseInt(count) || 5
    });
    // ...
```

- [ ] **Step 3: Verify build with `npm run build`**

Run: `npm run build`
Expected: Compile check pass.

- [ ] **Step 4: Commit Task 2**

```bash
git add src/app/api/generate/route.ts src/app/api/generate/ai.ts
git commit -m "feat: Enhance AI system prompt for strict competency/objective alignment and Unicode formulas"
```

---

### Task 3: Add Optional Objectives Field & Formula Formatting to UI (`src/app/page.tsx`)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `generateConfig` state, `formatFormula` from `src/utils/formatFormula.ts`
- Produces: Complete UI with optional Objectives input and formula sanitization.

- [ ] **Step 1: Add `objective` to `generateConfig` and render Specific Objectives input in `src/app/page.tsx`**

Add `objective: ""` to `generateConfig`:
```typescript
  const [generateConfig, setGenerateConfig] = useState({
    topic: "",
    competency: "",
    objective: "",
    grade: "Grade 10",
    subject: "Science",
    type: "Multiple Choice",
    difficulty: "Average",
    count: 5
  });
```

Render optional field right below Learning Competency in `page.tsx`:
```tsx
        <div className="form-group">
          <label>Learning Competency <span style={{ fontSize: '11px', opacity: 0.6 }}>(Optional)</span></label>
          <input 
            type="text" 
            className="neu-input" 
            placeholder="e.g. Balance chemical equations..." 
            value={generateConfig.competency}
            onChange={(e) => setGenerateConfig({...generateConfig, competency: e.target.value})}
          />
        </div>

        <div className="form-group">
          <label>Specific Objectives <span style={{ fontSize: '11px', opacity: 0.6 }}>(Optional)</span></label>
          <input 
            type="text" 
            className="neu-input" 
            placeholder="e.g. Determine coefficients of reactans..." 
            value={generateConfig.objective}
            onChange={(e) => setGenerateConfig({...generateConfig, objective: e.target.value})}
          />
        </div>
```

- [ ] **Step 2: Verify production build with `npm run build`**

Run: `npm run build`
Expected: `✓ Compiled successfully` with 0 errors.

- [ ] **Step 3: Commit Task 3**

```bash
git add src/app/page.tsx
git commit -m "feat: Add optional Specific Objectives field and UI formula formatting"
```
