# Multi-Section Worksheet Builder Design Specification

## Problem & Goal
Teachers need the ability to build multi-part worksheets (e.g. Part I: Multiple Choice, Part II: True or False, Part III: Identification) on a single document. Currently, the application only supports a single flat list of questions. The goal is to provide an intuitive, WYSIWYG section builder where users can create, reorder, edit, and delete multiple worksheet sections, while seamlessly generating AI questions for active sections and exporting formatted DOCX files.

---

## 1. Data Models & Types

Updated TypeScript interfaces in `src/types/index.ts`:

```typescript
export interface Question {
  id: string;
  text: string;
  options?: string[];
  correctAnswer?: number;
}

export interface Section {
  id: string;
  title: string;        // e.g. "PART I. MULTIPLE CHOICE"
  type: string;         // "Multiple Choice" | "True or False" | "Identification" | "Problem Solving" | "Essay"
  instructions: string; // e.g. "Read each item carefully. Choose the letter of the correct answer."
  questions: Question[];
}

export interface WorksheetData {
  title: string;
  teacher: string;
  school: string;
  instructions: string; // General Directions
  sections: Section[];
}
```

---

## 2. Component & UI Design

### Active Section State Management
- `sections: Section[]` stores all sections of the current worksheet.
- `activeSectionId: string | null` tracks which section is currently targeted for AI generation or editing.
- Initial state contains default **Part I: Multiple Choice** section so new users immediately have an active canvas.

### Worksheet Preview Canvas (`src/app/page.tsx`)
- **Document Header:** Editable Title, Name, Score, Grade/Section, Date, Teacher, General Directions.
- **Section Cards:**
  - Active section has a prominent blue border (`neu-flat` with active outline) and an "ACTIVE SECTION" badge.
  - Section Header controls: Editable Section Title & Section Instructions.
  - Section Action Bar:
    - **Move Up / Move Down**: Reorder sections in array.
    - **Delete Section**: Remove section and its questions.
    - **+ Add Question**: Add a blank editable question manually.
  - Question List:
    - Question text, options, and correct answer display.
    - Inline edit and delete buttons for individual questions.

### Section Builder Bar (Bottom of Preview)
- Interactive buttons to add new sections:
  - `+ Part: Multiple Choice`
  - `+ Part: True or False`
  - `+ Part: Identification`
  - `+ Part: Problem Solving`
  - `+ Part: Essay`
- Clicking any button creates a new `Section` with auto-numbered Roman Numerals (e.g. `PART II. TRUE OR FALSE`), appends it to `sections`, and sets it as `activeSectionId`.

### Sidebar AI Generator Sync
- Selecting a section on the canvas syncs `generateConfig.type` in the sidebar to match the section's type.
- Clicking **Generate Quiz** calls `/api/generate`, retrieves questions, and appends them to the targeted `activeSectionId`.

---

## 3. DOCX Export Engine (`src/utils/exportDocs.ts`)
- Updates `generateDocx` to accept `WorksheetData`.
- Iterates over `sections`:
  - Renders section title paragraph in bold uppercase.
  - Renders section instructions paragraph.
  - Formats questions per section (numbering resets or continues cleanly per section).
  - Handles layout per question type (Multiple Choice options A/B/C/D, True/False blanks, Identification blank lines, Essay response lines).

---

## 4. Verification & Testing
- Automated production build check (`npm run build`).
- Manual verification of:
  1. Adding Part I, Part II, Part III sections.
  2. Reordering and deleting sections.
  3. Generating AI questions targeted at active section.
  4. Exporting complete multi-part DOCX document.
