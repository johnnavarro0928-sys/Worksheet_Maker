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
