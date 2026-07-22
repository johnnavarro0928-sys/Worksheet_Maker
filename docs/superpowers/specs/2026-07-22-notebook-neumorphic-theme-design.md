# Notebook Neumorphic Theme Design Specification

## Problem & Goal
Transform the Worksheet Maker visual theme into a **Classic Lined Notebook in a 3D Neumorphic Desk** aesthetic. The goal is to provide a warm, tactile, handwriting-infused notebook experience for the worksheet preview canvas while preserving the soft, touchable 3D bulging neumorphic UI elements (`neu-flat`, `neu-pressed`, `neu-button`, `neu-input`).

---

## 1. Color System & CSS Tokens (`src/app/globals.css`)

```css
:root {
  --bg-color: #E8E3D9;            /* Warm Desk Clay Base */
  --bg-color-hover: #F2EDE4;
  --text-main: #2D3748;           /* Graphite Pencil Text */
  --text-muted: #718096;
  --accent-color: #1E3A8A;         /* Fountain Pen Navy Ink */
  --accent-color-hover: #1E40AF;
  --accent-gradient: linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%);
  --shadow-light: #FFFFFF;        /* Top-Left 3D Soft Light Bounce */
  --shadow-dark: #C4BCAE;         /* Bottom-Right 3D Bevel Shadow */
  --border-radius: 16px;
  --border-radius-sm: 8px;
  --border-radius-lg: 24px;
  
  --paper-tint: #FDFBF7;          /* Warm Ivory Notebook Paper */
  --notebook-line: rgba(64, 112, 196, 0.08); /* Blue Notebook Ruling */
  --notebook-margin: rgba(224, 75, 75, 0.45); /* Red Margin Line */
}
```

---

## 2. Typography & Fonts (`src/app/layout.tsx`)

Import Google Fonts:
- **`Outfit`**: Body and UI typography (weights 400, 600, 800).
- **`Caveat`**: Handwritten notebook font (weights 600, 700) for section badges, ACTIVE tags, and paper notes.

---

## 3. Notebook Paper Styling & Visual Details (`src/app/page.tsx` & `globals.css`)

1. **Worksheet Paper Styling:**
   - Background: `--paper-tint` (`#FDFBF7`).
   - Lined background pattern: `repeating-linear-gradient(transparent, transparent 27px, var(--notebook-line) 28px)`.
   - Red margin line: `border-left: 2px solid var(--notebook-margin)`.
   - Top binder spiral notches or binder clips.

2. **3D Neumorphic Controls:**
   - Retain 3D bulging buttons (`.neu-button`, `.neu-button-solid`) with soft tactile dual shadows (`#C4BCAE` & `#FFFFFF`).
   - Retain inset 3D inputs (`.neu-input`, `.neu-pressed`).

3. **Handwritten Accents:**
   - "ACTIVE SECTION" badge styled with `'Caveat', cursive` font and handwritten blue highlighter aesthetic.
   - Section headers formatted with bold fountain-pen ink styling.

---

## 4. Verification & Testing Plan
- Production build check (`npm run build`).
- Start local dev server (`npm run dev`) and present preview link (`http://localhost:3000`) for user approval BEFORE committing or pushing.
