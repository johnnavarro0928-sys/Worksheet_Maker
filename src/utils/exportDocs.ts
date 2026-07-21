import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

export const generateDocx = async (quizData: any) => {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: quizData.title || "WRITTEN WORK # 1",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Name: ______________________\t\t\t", bold: true }),
              new TextRun({ text: "Score: ______ / 20", bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Grade & Section: ______________________\t", bold: true }),
              new TextRun({ text: `Date: ______________________`, bold: true }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Teacher: ${quizData.teacher || ""}`, bold: true }),
            ],
          }),
          new Paragraph({
            text: "",
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "GENERAL DIRECTIONS: ", bold: true }),
              new TextRun({ text: quizData.instructions || "Read the specific directions for each part carefully. Strictly no erasures allowed." }),
            ],
          }),
          new Paragraph({
            text: "",
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "PART I. MULTIPLE CHOICE", bold: true }),
            ],
          }),
          new Paragraph({
            text: "Read each item carefully. Choose the letter of the correct answer.",
          }),
          new Paragraph({
            text: "",
          }),
          // Map real questions
          ...(quizData.questions || []).map((q: any, i: number) => (
            new Paragraph({
              children: [
                new TextRun({ text: `${i + 1}. ${q.text}`, bold: true }),
                ...(q.options ? q.options.map((opt: string, optIdx: number) => 
                  new TextRun({ text: `\n   ${String.fromCharCode(65 + optIdx)}. ${opt}`, break: 1 })
                ) : [new TextRun({ text: `\n   ___ True\n   ___ False`, break: 1 })]),
              ],
            })
          )),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${quizData.title || "Quiz"}.docx`);
};
