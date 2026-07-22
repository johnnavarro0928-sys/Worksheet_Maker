# Multi-Section Worksheet Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Worksheet Maker into a multi-section worksheet generator (Part I, Part II, Part III) with section editing, reordering, active section targeting for AI generation, and multi-section DOCX export.

**Architecture:** Extend `Question` interfaces into a structured `Section` model (`id`, `title`, `type`, `instructions`, `questions`). Update `page.tsx` with a WYSIWYG paper editor featuring section-level action bars, an active section targeting state, and a bottom Section Builder bar. Refactor `exportDocs.ts` to iterate through sections and generate formatted DOCX documents.

**Tech Stack:** Next.js (App Router), React, TypeScript, docx, file-saver, Lucide Icons.

## Global Constraints
- Next.js 16.2.10 (Turbopack) compatibility
- Retain existing Neumorphic / iOS styling tokens (`neu-flat`, `neu-input`, `neu-button`, `neu-pressed`)
- Zero external UI libraries added

---

### Task 1: Update TypeScript Definitions (`src/types/index.ts`)

**Files:**
- Modify: `src/types/index.ts`

**Interfaces:**
- Consumes: None
- Produces: `Question`, `Section`, `WorksheetData` interfaces exported for `page.tsx` and `exportDocs.ts`.

- [ ] **Step 1: Write updated interfaces in `src/types/index.ts`**

```typescript
export interface Question {
  id: string;
  text: string;
  options?: string[];
  correctAnswer?: number;
}

export interface Section {
  id: string;
  title: string;
  type: string;
  instructions: string;
  questions: Question[];
}

export interface WorksheetData {
  title: string;
  teacher: string;
  school: string;
  instructions: string;
  sections: Section[];
}
```

- [ ] **Step 2: Verify type compilation with `npm run build`**

Run: `npm run build`
Expected: Compile check (may show temporary unused interface warning until consumed in Task 2 & 3).

- [ ] **Step 3: Commit Task 1**

```bash
git add src/types/index.ts
git commit -m "feat: Add Section and WorksheetData type definitions"
```

---

### Task 2: Multi-Section DOCX Exporter (`src/utils/exportDocs.ts`)

**Files:**
- Modify: `src/utils/exportDocs.ts`

**Interfaces:**
- Consumes: `WorksheetData`, `Section`, `Question` from `src/types/index.ts`
- Produces: `generateDocx(quizData: WorksheetData): Promise<void>`

- [ ] **Step 1: Refactor `exportDocs.ts` to iterate over worksheet sections**

```typescript
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { WorksheetData } from "../types";

export const generateDocx = async (quizData: WorksheetData) => {
  const children: Paragraph[] = [
    new Paragraph({
      text: quizData.title || "WRITTEN WORK # 1",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `School: ${quizData.school || "______________________"}\t\t`, bold: true }),
        new TextRun({ text: `Teacher: ${quizData.teacher || "______________________"}`, bold: true }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Name: ______________________\t\t\t", bold: true }),
        new TextRun({ text: "Score: ______", bold: true }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Grade & Section: ______________________\t", bold: true }),
        new TextRun({ text: "Date: ______________________", bold: true }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({ text: "GENERAL DIRECTIONS: ", bold: true }),
        new TextRun({ text: quizData.instructions || "Read the specific directions for each part carefully. Strictly no erasures allowed." }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  // Iterate sections
  (quizData.sections || []).forEach((sec) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: sec.title.toUpperCase(), bold: true }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: sec.instructions || "" }),
        ],
      }),
      new Paragraph({ text: "" })
    );

    (sec.questions || []).forEach((q, i) => {
      const qChildren: TextRun[] = [
        new TextRun({ text: `${i + 1}. ${q.text}`, bold: true })
      ];

      if (q.options && q.options.length > 0) {
        q.options.forEach((opt, optIdx) => {
          qChildren.push(
            new TextRun({ text: `\n   ${String.fromCharCode(65 + optIdx)}. ${opt}`, break: 1 })
          );
        });
      } else if (sec.type === 'True or False') {
        qChildren.push(new TextRun({ text: `\n   ___ True    ___ False`, break: 1 }));
      } else if (sec.type === 'Identification' || sec.type === 'Problem Solving') {
        qChildren.push(new TextRun({ text: `\n   Answer: ______________________`, break: 1 }));
      } else if (sec.type === 'Essay') {
        qChildren.push(new TextRun({ text: `\n   ____________________________________________________________________\n   ____________________________________________________________________`, break: 1 }));
      }

      children.push(new Paragraph({ children: qChildren }));
      children.push(new Paragraph({ text: "" }));
    });
  });

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${quizData.title || "Worksheet"}.docx`);
};
```

- [ ] **Step 2: Commit Task 2**

```bash
git add src/utils/exportDocs.ts
git commit -m "feat: Upgrade DOCX generator to export multi-section worksheets"
```

---

### Task 3: Multi-Section UI & Generator Sync (`src/app/page.tsx`)

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `WorksheetData`, `Section`, `Question` from `src/types/index.ts`, `generateDocx` from `src/utils/exportDocs.ts`
- Produces: Complete Interactive Multi-Section Worksheet UI

- [ ] **Step 1: Implement Section-Based state, Section builder bar, and targeting logic in `src/app/page.tsx`**

Update `page.tsx` to:
1. Store `sections: Section[]` initialized with a default `Part I: Multiple Choice` section.
2. Store `activeSectionId: string` defaulting to Part I's id.
3. Update `handleGenerate` to append generated questions to the section matching `activeSectionId`.
4. Provide buttons to:
   - Add new section (`+ Part: Multiple Choice`, `+ Part: True or False`, etc.) with Roman numeral auto-naming (`PART I`, `PART II`, `PART III`).
   - Reorder section (`moveSection(index, direction)`).
   - Delete section (`deleteSection(sectionId)`).
   - Edit section title & instructions inline.
   - Delete / edit individual questions.
5. Auto-sync `generateConfig.type` in the sidebar whenever `activeSectionId` changes.

- [ ] **Step 2: Verify production build with `npm run build`**

Run: `npm run build`
Expected: `✓ Compiled successfully` with 0 errors.

- [ ] **Step 3: Commit Task 3**

```bash
git add src/app/page.tsx
git commit -m "feat: Implement interactive Multi-Section Worksheet Builder UI and AI section targeting"
```
