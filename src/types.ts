export interface Question {
  id: string;
  type?: string;
  text: string;
  options?: string[];
  correctAnswer?: number;
  answer?: string;
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
  schoolYear?: string;
  term?: string;
  instructions: string;
  sections: Section[];
}
