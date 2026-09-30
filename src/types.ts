import type { TosCognitiveLevel, TosPlan } from './utils/tosPlan';

export interface Question {
  id: string;
  type?: string;
  text: string;
  options?: string[];
  correctAnswer?: number;
  answer?: string;
  tosRowId?: string;
  tosCognitiveLevel?: TosCognitiveLevel;
}

export interface Section {
  id: string;
  title: string;
  type: string;
  instructions: string;
  questions: Question[];
  tosPlan?: TosPlan;
}

export interface WorksheetData {
  title: string;
  teacher: string;
  school: string;
  schoolYear?: string;
  term?: string;
  instructions: string;
  sections: Section[];
}
