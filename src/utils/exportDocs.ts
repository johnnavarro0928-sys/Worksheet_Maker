import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, VerticalAlign } from "docx";
import { saveAs } from "file-saver";
import { WorksheetData } from "../types";

// Convert centimeters to pixels (1 cm = 37.79527559 px)
const cmToPx = (cm: number) => Math.round(cm * 37.79527559);

async function getImageBuffer(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export const generateDocx = async (quizData: WorksheetData) => {
  const [matatagBuffer, sealBuffer] = await Promise.all([
    getImageBuffer('/images/logo_deped_matatag.png'),
    getImageBuffer('/images/logo_deped_seal.png')
  ]);

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
    left: { style: BorderStyle.NONE, size: 0, color: "auto" },
    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "auto" },
    insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
  };

  // Build a 2-cell nested table for the logos so Microsoft Word vertically centers their midpoints
  const logoCells: TableCell[] = [];

  if (matatagBuffer) {
    logoCells.push(
      new TableCell({
        borders: noBorder,
        verticalAlign: VerticalAlign.CENTER,
        width: { size: 1440, type: WidthType.DXA },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new ImageRun({
                data: matatagBuffer,
                type: "png",
                transformation: {
                  width: cmToPx(2.54), // 2.54 cm width
                  height: cmToPx(1.07) // 1.07 cm height
                }
              })
            ]
          })
        ]
      })
    );
  }

  if (sealBuffer) {
    logoCells.push(
      new TableCell({
        borders: noBorder,
        verticalAlign: VerticalAlign.CENTER,
        width: { size: 850, type: WidthType.DXA },
        children: [
          new Paragraph({
            alignment: AlignmentType.LEFT,
            children: [
              new ImageRun({
                data: sealBuffer,
                type: "png",
                transformation: {
                  width: cmToPx(1.38), // 1.38 cm width
                  height: cmToPx(1.38) // 1.38 cm height
                }
              })
            ]
          })
        ]
      })
    );
  }

  const logosSubTable = new Table({
    width: { size: 2290, type: WidthType.DXA },
    borders: noBorder,
    rows: [
      new TableRow({
        children: logoCells
      })
    ]
  });

  const children: (Paragraph | Table)[] = [];

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: noBorder,
    rows: [
      new TableRow({
        children: [
          // Left Cell: Nested Logos Subtable (Vertically Centered)
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            borders: noBorder,
            verticalAlign: VerticalAlign.CENTER,
            children: [logosSubTable]
          }),
          // Center Cell: School Info & Title
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            borders: noBorder,
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: quizData.school ? quizData.school.toUpperCase() : "SCHOOL NAME", bold: true, size: 22, color: "1E3A8A" })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: quizData.title || "WORKSHEET NO. 1", bold: true, size: 24 })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: quizData.schoolYear || "S.Y. 2026-2027", bold: true, size: 18 })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: quizData.term ? `TERM: ${quizData.term.toUpperCase()}` : "TERM: FIRST TERM", bold: true, size: 18 })
                ]
              })
            ]
          }),
          // Right Cell: Spacer to keep center balanced
          new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            borders: noBorder,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ text: "" })]
          })
        ]
      })
    ]
  });

  children.push(headerTable);
  children.push(new Paragraph({ text: "" }));

  // Student Info Block
  children.push(
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
        new TextRun({ text: (quizData.instructions || "").replace(/^\s*general\s+directions\s*:\s*/i, '') || "Read the specific directions for each part carefully. Strictly no erasures allowed." }),
      ],
    }),
    new Paragraph({ text: "" })
  );

  // Iterate sections
  (quizData.sections || []).forEach((sec) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: sec.title.toUpperCase(), bold: true, color: "1E3A8A" }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: sec.instructions || "", italics: true }),
        ],
      }),
      new Paragraph({ text: "" })
    );

    (sec.questions || []).forEach((q, i) => {
      let cleanText = (q.text || "").trim();
      while (/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i.test(cleanText)) {
        cleanText = cleanText.replace(/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i, '').trim();
      }

      const qChildren: TextRun[] = [
        new TextRun({ text: `${i + 1}. ${cleanText}`, bold: true })
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

  // Page Margins: Narrow Layout (0.5 in / 720 dxa on all sides)
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,     // 0.5 in
              right: 720,   // 0.5 in
              bottom: 720,  // 0.5 in
              left: 720     // 0.5 in
            }
          }
        },
        children
      }
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${quizData.title || "Worksheet"}.docx`);
};
