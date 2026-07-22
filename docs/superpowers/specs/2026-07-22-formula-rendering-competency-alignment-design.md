# Formula Rendering & Competency/Objective Alignment Design Specification

## Problem & Goal
Teachers need questions to strictly align with target Learning Competencies and Specific Objectives, while properly rendering mathematical exponents and chemical subscripts (e.g. `H₂O`, `x²`, `10⁵`, `CO₂`) across both the browser preview and Microsoft Word `.docx` exports.

Currently, `competency` is captured in the UI but omitted from API requests, and formula expressions lack explicit Unicode super/subscript instructions.

---

## 1. Sidebar UI Extensions (`src/app/page.tsx`)

Add an optional **Specific Objectives** field to `generateConfig`:
```typescript
const [generateConfig, setGenerateConfig] = useState({
  topic: "",
  competency: "",
  objective: "", // New optional field
  grade: "Grade 10",
  subject: "Science",
  type: "Multiple Choice",
  difficulty: "Average",
  count: 5
});
```

---

## 2. API & Prompt Alignment (`src/app/api/generate/route.ts` & `ai.ts`)

### `QuizParams` Interface Update:
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

### System Prompt Engineering:
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

---

## 3. Formula Auto-Sanitizer Utility (`src/utils/formatFormula.ts`)

A utility function to safely auto-convert standard caret exponents (`x^2` -> `x²`) and common chemical notation into Unicode characters if an LLM outputs raw caret strings:
- Maps numbers `^0`..`^9` to `⁰`..`⁹`, `^+` to `⁺`, `^-` to `⁻`.
- Replaces common chemical subscripts in formulas.

---

## 4. Verification & Testing
- Build verification (`npm run build`).
- Verify formula rendering in web preview and DOCX export.
- Verify competency & objective integration in AI generation payload.
