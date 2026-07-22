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
