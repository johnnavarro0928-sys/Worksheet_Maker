export interface Question {
  id: string;
  type: string;
  text: string;
  options?: string[];
  answer?: string;
}
