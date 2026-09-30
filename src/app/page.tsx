"use client";

import { Edit3, Eye, Library, Save, Printer, FileText, Download, PencilRuler, Plus, BookOpen, Loader2, ArrowUp, ArrowDown, Trash2, CheckCircle2, Bookmark } from "lucide-react";
import { generateDocx } from "../utils/exportDocs";
import { useState, useEffect, useRef } from "react";
import { Question, Section, WorksheetData } from "../types";
import { QuestionBatchRequest, QuestionGenerationConfig, generateUniqueQuestionBatches } from "../utils/generateUniqueQuestionBatches";
import { stripAnswerLabelPrefixes } from "../utils/answerOptionLabels";
import { SavedWorksheet, loadLibrary, saveWorksheet, deleteWorksheet } from "../utils/worksheetLibrary";
import TosEditor from "../components/TosEditor";
import TosReview from "../components/TosReview";
import type { TosPlan } from "../utils/tosPlan";
import { exportTosReport, getTosReportStatus, type TosReportInput } from "../utils/tosExport";
import {
  TOS_DEFAULT_ENABLED,
  canSubmitTosGeneration,
  commitTosGeneration,
  createEmptyTosPlan,
  createTosApproval,
  getTosApprovalStatus,
  isTosGenerationContextCurrent,
  getTosGenerationPersistenceIssue,
  isTosAvailable,
  validateTosEditorDraft,
  type TosApprovalSnapshot,
  type TosGenerationContext,
} from "../utils/tosEditorState";

const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

type TosRequestBody = {
  topic: string;
  competency: string;
  objective: string;
  grade: string;
  subject: string;
  language: string;
  type: 'Multiple Choice';
  count: number;
  generationMode: 'tos';
  tosPlan: TosPlan;
};

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).substring(2, 9)}`;
}

export default function Home() {
  // Quiz Header State
  const [quizData, setQuizData] = useState({
    title: "WRITTEN WORK # 1",
    teacher: "",
    school: "",
    schoolYear: "S.Y. 2026-2027",
    term: "FIRST TERM",
    instructions: "Read the specific directions for each part carefully. Strictly no erasures allowed."
  });

  // AI Generation Form State
  const [generateConfig, setGenerateConfig] = useState({
    topic: "",
    competency: "",
    objective: "",
    grade: "Grade 10",
    subject: "Science",
    language: "English",
    type: "Multiple Choice",
    difficulty: "Average",
    count: 5
  });

  // Sections State
  const [sections, setSections] = useState<Section[]>([
    {
      id: "sec-1",
      title: "PART I. MULTIPLE CHOICE",
      type: "Multiple Choice",
      instructions: "Read each item carefully. Choose the letter of the correct answer.",
      questions: []
    }
  ]);

  const [activeSectionId, setActiveSectionId] = useState<string>("sec-1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [tosEnabled, setTosEnabled] = useState(TOS_DEFAULT_ENABLED);
  const [tosPlan, setTosPlan] = useState<TosPlan>(() => createEmptyTosPlan());
  const [tosApproval, setTosApproval] = useState<TosApprovalSnapshot | null>(null);
  const [tosGenerationError, setTosGenerationError] = useState<string | null>(null);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [library, setLibrary] = useState<SavedWorksheet[]>([]);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const generationContextRef = useRef<TosGenerationContext>({ revision: 0 });
  const invalidateGenerationContext = () => {
    generationContextRef.current = {
      revision: generationContextRef.current.revision + 1,
    };
  };

  // Load library from localStorage on mount
  useEffect(() => {
    setLibrary(loadLibrary());
  }, []);

  const updateGenerateConfig = (updates: Partial<typeof generateConfig>) => {
    invalidateGenerationContext();
    setGenerateConfig((prev) => ({ ...prev, ...updates }));
  };

  const updateQuizData = (updates: Partial<typeof quizData>) => {
    invalidateGenerationContext();
    setQuizData((prev) => ({ ...prev, ...updates }));
  };

  const handleQuestionTypeChange = (type: string) => {
    updateGenerateConfig({ type });
    setTosEnabled(false);
    setTosApproval(null);
    setTosGenerationError(null);
  };

  // Section Management Handlers
  const handleSelectSection = (sec: Section) => {
    setActiveSectionId(sec.id);
    handleQuestionTypeChange(sec.type);
  };

  const handleAddSection = (type: string) => {
    const nextIndex = sections.length;
    const roman = ROMAN_NUMERALS[nextIndex] || `${nextIndex + 1}`;
    const newSection: Section = {
      id: createId('sec'),
      title: `PART ${roman}. ${type.toUpperCase()}`,
      type: type,
      instructions: getDefaultInstructions(type),
      questions: []
    };

    setSections((prev) => [...prev, newSection]);
    setActiveSectionId(newSection.id);
    handleQuestionTypeChange(type);
  };

  const handleDeleteSection = (secId: string) => {
    if (sections.length <= 1) {
      alert("Worksheet must have at least one section.");
      return;
    }
    const updated = sections.filter((s) => s.id !== secId);
    invalidateGenerationContext();
    setSections(updated);
    if (activeSectionId === secId) {
      setActiveSectionId(updated[0].id);
      handleQuestionTypeChange(updated[0].type);
    }
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    invalidateGenerationContext();

    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    // Update Part titles with Roman Numerals while preserving custom subtitles
    const renumbered = newSections.map((sec, idx) => {
      const roman = ROMAN_NUMERALS[idx] || `${idx + 1}`;
      const subtitle = sec.title.includes('.') ? sec.title.split('.').slice(1).join('.').trim() : sec.title.replace(/^PART\s+[I|V|X\d]+\s*/i, '').trim() || sec.type.toUpperCase();
      return {
        ...sec,
        title: `PART ${roman}. ${subtitle}`
      };
    });

    setSections(renumbered);
  };

  const handleUpdateSection = (secId: string, updates: Partial<Section>) => {
    invalidateGenerationContext();
    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, ...updates } : s))
    );
  };

  const handleAddQuestion = (secId: string) => {
    const targetSec = sections.find((s) => s.id === secId);
    if (!targetSec) return;

    invalidateGenerationContext();

    const newQ: Question = {
      id: createId('q'),
      text: "Enter your question text here...",
      options: targetSec.type === 'Multiple Choice' ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
      correctAnswer: 0
    };

    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, questions: [...s.questions, newQ] } : s))
    );
  };

  const handleDeleteQuestion = (secId: string, qId: string) => {
    invalidateGenerationContext();
    setSections((prev) =>
      prev.map((s) =>
        s.id === secId
          ? { ...s, questions: s.questions.filter((q) => q.id !== qId) }
          : s
      )
    );
  };

  const handleUpdateQuestion = (secId: string, qId: string, newText: string) => {
    invalidateGenerationContext();
    setSections((prev) =>
      prev.map((s) =>
        s.id === secId
          ? {
              ...s,
              questions: s.questions.map((q) => (q.id === qId ? { ...q, text: newText } : q))
            }
          : s
      )
    );
  };

  function getDefaultInstructions(type: string): string {
    switch (type) {
      case "Multiple Choice":
        return "Read each item carefully. Choose the letter of the correct answer.";
      case "True or False":
        return "Write TRUE if the statement is correct, and FALSE if it is incorrect.";
      case "Identification":
        return "Identify what is being described in each item. Write your answer on the space provided.";
      case "Problem Solving":
        return "Solve the following problems completely. Show your full solution.";
      case "Essay":
        return "Answer the following questions concisely in complete sentences.";
      default:
        return "Read and follow the instructions carefully.";
    }
  }

  const handleExportDocx = async () => {
    const fullWorksheet: WorksheetData = {
      ...quizData,
      sections: sections
    };
    await generateDocx(fullWorksheet, includeAnswerKey);
  };

  const getTosReportInput = (): TosReportInput => ({
    worksheetTitle: quizData.title,
    section: sections.find((section) => section.id === activeSectionId) || sections[0],
  });

  const handleExportTosReport = async () => {
    const input = getTosReportInput();
    const status = getTosReportStatus(input);
    if (!status.eligible) {
      alert(status.message || 'TOS report export is unavailable.');
      return;
    }

    try {
      await exportTosReport(input);
    } catch {
      alert('TOS report export failed. No file was created.');
    }
  };

  const handleSave = () => {
    const fullWorksheet: WorksheetData = { ...quizData, sections };
    const updated = saveWorksheet(fullWorksheet);
    setLibrary(updated);
    alert(`Worksheet "${fullWorksheet.title}" saved to your library.`);
  };

  const handleLoadFromLibrary = (entry: SavedWorksheet) => {
    const loadedSections = entry.worksheet.sections;
    const loadedActiveSection = loadedSections[0];

    invalidateGenerationContext();
    setQuizData({
      title: entry.worksheet.title,
      teacher: entry.worksheet.teacher,
      school: entry.worksheet.school,
      schoolYear: entry.worksheet.schoolYear ?? '',
      term: entry.worksheet.term ?? '',
      instructions: entry.worksheet.instructions,
    });
    setGenerateConfig((prev) => ({
      ...prev,
      type: loadedActiveSection?.type ?? prev.type,
    }));
    setSections(loadedSections);
    setActiveSectionId(loadedActiveSection?.id ?? '');
    setTosEnabled(false);
    setTosPlan(createEmptyTosPlan());
    setTosApproval(null);
    setTosGenerationError(null);
    setIsLibraryOpen(false);
  };

  const handleDeleteFromLibrary = (id: string) => {
    const updated = deleteWorksheet(id);
    setLibrary(updated);
  };

  const tosDraft = {
    plan: tosPlan,
    config: {
      topic: generateConfig.topic,
      competency: generateConfig.competency,
      objective: generateConfig.objective,
      grade: generateConfig.grade,
      subject: generateConfig.subject,
      language: generateConfig.language,
      type: generateConfig.type,
      count: generateConfig.count,
    },
  };
  const tosValidation = validateTosEditorDraft(tosDraft);
  const tosApprovalStatus = getTosApprovalStatus(tosDraft, tosApproval);

  const handleTosEnabledChange = (enabled: boolean) => {
    invalidateGenerationContext();
    setTosEnabled(enabled);
    setTosGenerationError(null);
    if (!enabled) setTosApproval(null);
  };

  const handleTosPlanChange = (plan: TosPlan) => {
    invalidateGenerationContext();
    setTosPlan(plan);
  };

  const handleTosApprove = () => {
    const approval = createTosApproval(tosDraft);
    if (!approval) return;
    invalidateGenerationContext();
    setTosApproval(approval);
    setTosGenerationError(null);
  };

  const handleGenerate = async () => {
    const approvedTos = tosEnabled ? tosApproval : null;
    const targetSection = sections.find((s) => s.id === activeSectionId);
    if (!tosEnabled && (!generateConfig.topic || !generateConfig.competency)) {
      alert("Please enter both Topic and Learning Competency before generating.");
      return;
    }
    if (tosEnabled && (!targetSection || !isTosAvailable(targetSection.type))) {
      setTosGenerationError('TOS generation is available only for an active Multiple Choice section.');
      return;
    }
    if (tosEnabled) {
      const persistenceIssue = getTosGenerationPersistenceIssue(targetSection);
      if (persistenceIssue) {
        setTosGenerationError(persistenceIssue);
        return;
      }
    }
    if (tosEnabled && (!approvedTos || !canSubmitTosGeneration(tosDraft, approvedTos, true))) {
      setTosGenerationError(
        tosApprovalStatus === 'stale'
          ? 'TOS approval is stale. Review the latest configuration and approve the plan again.'
          : 'Fix the TOS plan and approve it before generating.',
      );
      return;
    }

    const startedContext = generationContextRef.current;

    setTosGenerationError(null);
    setIsGenerating(true);
    try {
      const totalCount = tosEnabled && approvedTos ? approvedTos.config.count : generateConfig.count || 5;
      const fetchGeneration = async (requestBody: QuestionBatchRequest | QuestionGenerationConfig | TosRequestBody) => {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(`Generation Error (${res.status}): ${errorData.error || res.statusText || 'Failed to generate questions'}`);
        }
        const data = await res.json();
        return data.questions || [];
      };

      const allQuestions = tosEnabled && approvedTos
        ? await fetchGeneration({
            ...approvedTos.config,
            type: 'Multiple Choice',
            generationMode: 'tos',
            tosPlan: approvedTos.plan,
          })
        : await generateUniqueQuestionBatches(
            { ...generateConfig, count: totalCount },
            fetchGeneration,
            targetSection?.questions || [],
          );

      if (tosEnabled && approvedTos) {
        if (!isTosGenerationContextCurrent(startedContext, generationContextRef.current)) {
          setTosGenerationError('TOS generation was cancelled because the worksheet changed while it was generating.');
          return;
        }

        const cleanedQuestions = allQuestions.map((q: Question) => {
          let cleanText = (q.text || "").trim();
          while (/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i.test(cleanText)) {
            cleanText = cleanText.replace(/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i, '').trim();
          }
          return { ...q, text: cleanText };
        });
        const commitResult = commitTosGeneration(targetSection, approvedTos.plan, cleanedQuestions, totalCount);
        if (!commitResult.success) {
          setTosGenerationError(commitResult.error);
          return;
        }

        setSections((prev) =>
          prev.map((s) => (s.id === activeSectionId ? commitResult.section : s))
        );
        return;
      }

      if (allQuestions.length > 0) {
        const cleanedQuestions = allQuestions.map((q: Question) => {
          let cleanText = (q.text || "").trim();
          while (/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i.test(cleanText)) {
            cleanText = cleanText.replace(/^\s*(Q?\d+[\.\)\:]|\d+)\s*/i, '').trim();
          }
          return { ...q, text: cleanText };
        });

        setSections((prev) =>
          prev.map((s) =>
            s.id === activeSectionId
              ? { ...s, questions: [...s.questions, ...cleanedQuestions] }
              : s
          )
        );
        if (!tosEnabled && cleanedQuestions.length < totalCount) {
          alert(`Generated ${cleanedQuestions.length} unique questions. Some repeated items were removed; try generating again to add more.`);
        }
      } else {
        alert("No questions returned from generator.");
      }
    } catch (e: unknown) {
      if (tosEnabled) {
        setTosGenerationError('TOS generation failed. No questions were added.');
      } else {
        const err = e as Error;
        alert(err.message || "Network error: Unable to connect to generator API.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const activeSection = sections.find((s) => s.id === activeSectionId) || sections[0];
  const tosReportStatus = getTosReportStatus({
    worksheetTitle: quizData.title,
    section: activeSection,
  });

  return (
    <div className="dashboard-container">
      {/* 3D Neumorphic Sidebar */}
      <aside className="sidebar neu-flat">
        <div style={{ padding: '0 5px', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-color)' }}>
            <img src="/images/sayuna_logo.png" alt="Sayuna Logo" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
            WORKSHEET MAKER
          </h2>
          {activeSection && (
            <div className="handwritten" style={{ fontSize: '15px', color: '#1E3A8A', marginTop: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Bookmark size={14} color="#1E3A8A" /> Active: {activeSection.title.split('.')[0]}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Topic</label>
          <input
            type="text"
            className="neu-input"
            placeholder="e.g. Solar System, Photosynthesis..."
            value={generateConfig.topic}
            onChange={(e) => updateGenerateConfig({ topic: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Learning Competencies</label>
          <textarea
            className="neu-input"
            rows={2}
            style={{ resize: 'vertical' }}
            placeholder="Enter one or more competencies (e.g. 1. Identify planets, 2. Compare orbits)..."
            value={generateConfig.competency}
            onChange={(e) => updateGenerateConfig({ competency: e.target.value })}
          ></textarea>
        </div>

        <div className="form-group">
          <label>Specific Objectives <span style={{ fontSize: '10px', opacity: 0.6 }}>(Optional)</span></label>
          <textarea
            className="neu-input"
            rows={2}
            style={{ resize: 'vertical' }}
            placeholder="Enter one or more objectives (e.g. 1. Recall planet names, 2. Calculate distance)..."
            value={generateConfig.objective}
            onChange={(e) => updateGenerateConfig({ objective: e.target.value })}
          ></textarea>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Grade</label>
            <select className="neu-input" value={generateConfig.grade} onChange={(e) => updateGenerateConfig({ grade: e.target.value })}>
              <option>Kindergarten</option>
              <option>Grade 1</option>
              <option>Grade 2</option>
              <option>Grade 3</option>
              <option>Grade 4</option>
              <option>Grade 5</option>
              <option>Grade 6</option>
              <option>Grade 7</option>
              <option>Grade 8</option>
              <option>Grade 9</option>
              <option>Grade 10</option>
              <option>Grade 11</option>
              <option>Grade 12</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Subject</label>
            <input
              type="text"
              className="neu-input"
              placeholder="e.g. Science, Araling Panlipunan..."
              value={generateConfig.subject}
              onChange={(e) => updateGenerateConfig({ subject: e.target.value })}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Output Language</label>
          <select
            className="neu-input"
            value={generateConfig.language}
            onChange={(e) => updateGenerateConfig({ language: e.target.value })}
          >
            <option>English</option>
            <option>Filipino</option>
            <option>English-Filipino bilingual</option>
          </select>
        </div>

        <div className="form-group">
          <label>Question Type</label>
          <select
            className="neu-input"
            value={generateConfig.type}
            onChange={(e) => {
              const newType = e.target.value;
              handleQuestionTypeChange(newType);
              if (activeSectionId) {
                handleUpdateSection(activeSectionId, { type: newType });
              }
            }}
          >
            <option>Multiple Choice</option>
            <option>True or False</option>
            <option>Identification</option>
            <option>Problem Solving</option>
            <option>Essay</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Difficulty</label>
            <select className="neu-input" value={generateConfig.difficulty} onChange={(e) => updateGenerateConfig({ difficulty: e.target.value })}>
              <option>Easy</option>
              <option>Average</option>
              <option>Hard</option>
            </select>
          </div>
          <div className="form-group" style={{ width: '80px' }}>
            <label>Count</label>
            <input
              type="number"
              className="neu-input"
              value={generateConfig.count}
              onChange={(e) => updateGenerateConfig({ count: parseInt(e.target.value) || 1 })}
              min={1}
              max={50}
            />
          </div>
        </div>

        <TosEditor
          enabled={tosEnabled}
          questionType={generateConfig.type}
          plan={tosPlan}
          expectedTotal={generateConfig.count}
          validation={tosValidation}
          approvalStatus={tosApprovalStatus}
          generationError={tosGenerationError}
          isGenerating={isGenerating}
          onEnabledChange={handleTosEnabledChange}
          onPlanChange={handleTosPlanChange}
          onApprove={handleTosApprove}
        />

        <TosReview section={activeSection} />

        <button
          className="neu-button-solid bg-ios-blue"
          style={{ marginTop: '10px', padding: '12px', opacity: isGenerating ? 0.7 : 1, fontSize: '15px' }}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <PencilRuler size={18} />}
          {isGenerating ? "Generating..." : `Add to ${activeSection?.title.split('.')[0] || 'Section'}`}
        </button>

        <hr style={{ border: 'none', borderTop: '1px solid var(--shadow-dark)', margin: '12px 0', opacity: 0.4 }} />

        <div style={{ padding: '0 5px', marginTop: '8px', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '13px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <BookOpen size={16} /> Worksheet Headers & Info
          </h3>
        </div>

        <div className="form-group">
          <label>Worksheet Title</label>
          <input type="text" className="neu-input" value={quizData.title} onChange={(e) => updateQuizData({ title: e.target.value })} />
        </div>

        <div className="form-group">
          <label>School Name</label>
          <input type="text" className="neu-input" placeholder="Enter school name" value={quizData.school} onChange={(e) => updateQuizData({ school: e.target.value })} />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>School Year</label>
            <input type="text" className="neu-input" placeholder="e.g. S.Y. 2026-2027" value={quizData.schoolYear} onChange={(e) => updateQuizData({ schoolYear: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Term</label>
            <input type="text" className="neu-input" placeholder="e.g. FIRST TERM" value={quizData.term} onChange={(e) => updateQuizData({ term: e.target.value })} />
          </div>
        </div>

        <div className="form-group">
          <label>Teacher Name</label>
          <input type="text" className="neu-input" placeholder="Enter teacher name" value={quizData.teacher} onChange={(e) => updateQuizData({ teacher: e.target.value })} />
        </div>

        <div className="form-group">
          <label>General Directions</label>
          <textarea className="neu-input" rows={3} style={{ resize: 'vertical' }} value={quizData.instructions} onChange={(e) => updateQuizData({ instructions: e.target.value })}></textarea>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid rgba(0,0,0,0.06)', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500' }}>
          Copyright © {new Date().getFullYear()} Sayuna AI.<br/>All rights reserved.
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* 3D Neumorphic Topbar */}
        <header className="topbar neu-flat">
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="neu-button-solid bg-ios-gray">
              <Edit3 size={16} /> Edit
            </button>
            <button className="neu-button-solid bg-ios-green">
              <Eye size={16} /> Preview
            </button>
            <button className="neu-button-solid bg-ios-gray" onClick={() => setIsLibraryOpen(true)}>
              <Library size={16} /> Library
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="neu-button-solid bg-ios-orange" onClick={handleSave}>
              <Save size={16} /> Save
            </button>
            <button className="neu-button-solid bg-ios-gray">
              <Printer size={16} /> Print
            </button>
            <button className="neu-button-solid bg-ios-red">
              <FileText size={16} /> PDF
            </button>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', cursor: 'pointer' }}>
              <input type="checkbox" checked={includeAnswerKey} onChange={(e) => setIncludeAnswerKey(e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
              Include Answer Key
            </label>
            <button className="neu-button-solid bg-ios-blue" onClick={handleExportDocx}>
              <Download size={16} /> DOCX
            </button>
            {tosReportStatus.review.visible && (
              <div className="tos-export-action">
                <button
                  className="neu-button-solid bg-ios-blue"
                  onClick={handleExportTosReport}
                  disabled={!tosReportStatus.eligible}
                  title={tosReportStatus.message || 'Export the active section TOS report.'}
                >
                  <FileText size={16} /> Export TOS Report
                </button>
                {!tosReportStatus.eligible && tosReportStatus.message && (
                  <span className="tos-export-action__message" role="status">
                    {tosReportStatus.message}
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        {/* 3D Neumorphic Preview Canvas Desk Area */}
        <section className="preview-area neu-flat" style={{ gap: '16px' }}>
          <div className="neu-pressed" style={{ padding: '16px', flex: 1, overflowY: 'auto', borderRadius: '16px' }}>
            
            {/* Authentic Notebook Worksheet Sheet */}
            <div className="notebook-paper" style={{ width: '100%', margin: '0 auto', borderRadius: '8px', padding: '40px 48px', color: 'var(--text-main)' }}>
              
              {/* Binder Spiral Ring Notches at Top */}
              <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '24px', opacity: 0.35 }}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} style={{ width: '12px', height: '16px', borderRadius: '4px', background: '#333', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.4)' }} />
                ))}
              </div>

              {/* Document Header with Upper-Left Logos & Centered School Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', marginBottom: '24px', gap: '16px' }}>
                {/* Upper Left Logos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'flex-start' }}>
                  <img
                    src="/images/logo_deped_matatag.png"
                    alt="DepEd MATATAG"
                    style={{ height: '1.07cm', width: '2.54cm', objectFit: 'contain' }}
                  />
                  <img
                    src="/images/logo_deped_seal.png"
                    alt="Kagawaran ng Edukasyon Seal"
                    style={{ height: '1.38cm', width: '1.38cm', objectFit: 'contain' }}
                  />
                </div>

                {/* Center School Info & Title */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '15px', fontWeight: '800', color: '#1E3A8A', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {quizData.school || "SCHOOL NAME"}
                  </div>
                  <h1 style={{ fontSize: '20px', fontWeight: '800', color: '#111827', margin: '3px 0' }}>
                    {quizData.title}
                  </h1>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>
                    {quizData.schoolYear || "S.Y. 2026-2027"}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#374151' }}>
                    TERM: {quizData.term || "FIRST TERM"}
                  </div>
                </div>

                {/* Right Spacer */}
                <div style={{ minWidth: '3.41cm' }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', fontSize: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><strong>Name:</strong> ____________________________________</div>
                  <div><strong>Score:</strong> _______</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div><strong>Grade & Section:</strong> ________________________</div>
                  <div><strong>Date:</strong> ________________________</div>
                </div>
              </div>

              {quizData.instructions && (
                <div style={{ marginBottom: '32px', fontSize: '14px', background: 'rgba(255,255,255,0.7)', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #1E3A8A' }}>
                  <strong>GENERAL DIRECTIONS:</strong> {quizData.instructions.replace(/^\s*general\s+directions\s*:\s*/i, '')}
                </div>
              )}

              {/* Sections List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                {sections.map((sec, secIdx) => {
                  const isActive = sec.id === activeSectionId;
                  return (
                    <div
                      key={sec.id}
                      onClick={() => handleSelectSection(sec)}
                      style={{
                        padding: '20px',
                        borderRadius: '10px',
                        border: isActive ? '2px solid #1E3A8A' : '1px dashed #cbd5e1',
                        background: isActive ? 'rgba(238, 242, 255, 0.6)' : 'rgba(255, 255, 255, 0.5)',
                        boxShadow: isActive ? '0 4px 12px rgba(30, 58, 138, 0.08)' : 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                    >
                      {isActive && (
                        <div className="handwritten" style={{ position: 'absolute', top: '-14px', right: '16px', background: '#1E3A8A', color: '#fff', fontSize: '14px', fontWeight: 'bold', padding: '2px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 6px rgba(30,58,138,0.3)' }}>
                          <CheckCircle2 size={14} /> ACTIVE SECTION
                        </div>
                      )}

                      {/* Section Title & Controls Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            value={sec.title}
                            onChange={(e) => handleUpdateSection(sec.id, { title: e.target.value })}
                            style={{ fontSize: '17px', fontWeight: '800', color: '#1E3A8A', width: '100%', border: 'none', background: 'transparent', borderBottom: '1px dashed #94a3b8', paddingBottom: '4px' }}
                          />
                          <input
                            type="text"
                            value={sec.instructions}
                            onChange={(e) => handleUpdateSection(sec.id, { instructions: e.target.value })}
                            placeholder="Section instructions..."
                            style={{ fontSize: '13px', color: '#475569', width: '100%', border: 'none', background: 'transparent', marginTop: '6px', fontStyle: 'italic' }}
                          />
                        </div>

                        {/* Controls Toolbar */}
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            title="Move Up"
                            disabled={secIdx === 0}
                            onClick={() => handleMoveSection(secIdx, 'up')}
                            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: '#e2e8f0', cursor: secIdx === 0 ? 'not-allowed' : 'pointer', opacity: secIdx === 0 ? 0.4 : 1 }}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            title="Move Down"
                            disabled={secIdx === sections.length - 1}
                            onClick={() => handleMoveSection(secIdx, 'down')}
                            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: '#e2e8f0', cursor: secIdx === sections.length - 1 ? 'not-allowed' : 'pointer', opacity: secIdx === sections.length - 1 ? 0.4 : 1 }}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            title="Add Question"
                            onClick={() => handleAddQuestion(sec.id)}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', background: '#1E3A8A', color: '#fff', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Plus size={14} /> Question
                          </button>
                          <button
                            title="Delete Section"
                            onClick={() => handleDeleteSection(sec.id)}
                            style={{ padding: '6px', borderRadius: '6px', border: 'none', background: '#D32F2F', color: '#fff', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Questions List */}
                      {sec.questions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '16px', color: '#64748B', fontSize: '13px', fontStyle: 'italic', border: '1px dashed #cbd5e1', borderRadius: '6px' }}>
                          No questions in this section yet. Click &quot;Add to Section&quot; in the sidebar or &quot;+ Question&quot; above.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                          {sec.questions.map((q, qIdx) => (
                            <div key={q.id || qIdx} style={{ fontSize: '15px', background: 'rgba(255,255,255,0.85)', padding: '12px 14px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span style={{ fontWeight: 'bold', color: '#1E3A8A' }}>{qIdx + 1}.</span>
                                <input
                                  type="text"
                                  value={q.text}
                                  onChange={(e) => handleUpdateQuestion(sec.id, q.id, e.target.value)}
                                  style={{ flex: 1, border: 'none', background: 'transparent', borderBottom: '1px dotted #cbd5e1', fontSize: '15px', color: '#1e293b' }}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteQuestion(sec.id, q.id);
                                  }}
                                  style={{ border: 'none', background: 'transparent', color: '#D32F2F', cursor: 'pointer', padding: '2px' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              {/* Question Type specific displays */}
                              {q.options && q.options.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingLeft: '24px', marginTop: '8px' }}>
                                  {stripAnswerLabelPrefixes(q.options).map((opt, i) => (
                                    <div key={i} style={{ fontSize: '14px', color: '#334155' }}>{String.fromCharCode(65 + i)}. {opt}</div>
                                  ))}
                                </div>
                              )}
                              {sec.type === 'True or False' && (
                                <div style={{ display: 'flex', gap: '24px', paddingLeft: '24px', marginTop: '8px', fontSize: '14px', color: '#475569' }}>
                                  <div>___ True</div>
                                  <div>___ False</div>
                                </div>
                              )}
                              {(sec.type === 'Identification' || sec.type === 'Problem Solving') && (
                                <div style={{ paddingLeft: '24px', marginTop: '8px', fontSize: '14px', color: '#475569' }}>
                                  Answer: ________________________________________
                                </div>
                              )}
                              {sec.type === 'Essay' && (
                                <div style={{ paddingLeft: '24px', marginTop: '8px', fontSize: '14px', color: '#475569' }}>
                                  ____________________________________________________________________<br />
                                  ____________________________________________________________________
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Section Builder Bar */}
          <div className="neu-flat" style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              + ADD NEW SECTION TO WORKSHEET
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button className="neu-button" onClick={() => handleAddSection('Multiple Choice')}>
                <Plus size={15} /> Part: Multiple Choice
              </button>
              <button className="neu-button" onClick={() => handleAddSection('True or False')}>
                <Plus size={15} /> Part: True or False
              </button>
              <button className="neu-button" onClick={() => handleAddSection('Identification')}>
                <Plus size={15} /> Part: Identification
              </button>
              <button className="neu-button" onClick={() => handleAddSection('Problem Solving')}>
                <Plus size={15} /> Part: Problem Solving
              </button>
              <button className="neu-button" onClick={() => handleAddSection('Essay')}>
                <Plus size={15} /> Part: Essay
              </button>
            </div>
          </div>

          {/* Dynamic Copyright Footer */}
          <footer style={{ textAlign: 'center', padding: '6px 0 2px 0', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '600', opacity: 0.85 }}>
            Copyright © {new Date().getFullYear()} Sayuna AI. All rights reserved.
          </footer>
        </section>
      </main>

      {/* Library Modal */}
      {isLibraryOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setIsLibraryOpen(false)}
        >
          <div
            className="neu-flat"
            style={{
              width: 'min(680px, 92vw)', maxHeight: '80vh',
              borderRadius: '20px', padding: '28px 28px 20px',
              display: 'flex', flexDirection: 'column', gap: '16px',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Library size={18} /> Saved Worksheets
              </h2>
              <button
                className="neu-button"
                style={{ fontSize: '13px', padding: '6px 14px' }}
                onClick={() => setIsLibraryOpen(false)}
              >
                Close
              </button>
            </div>

            {library.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center', padding: '24px 0' }}>
                No saved worksheets yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {library.map((entry) => (
                  <div
                    key={entry.id}
                    className="neu-pressed"
                    style={{
                      borderRadius: '12px', padding: '14px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.worksheet.title}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {new Date(entry.savedAt).toLocaleString()}
                        {entry.worksheet.school ? ` · ${entry.worksheet.school}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        className="neu-button-solid bg-ios-blue"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                        onClick={() => handleLoadFromLibrary(entry)}
                      >
                        Load
                      </button>
                      <button
                        className="neu-button-solid bg-ios-red"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                        onClick={() => handleDeleteFromLibrary(entry.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      ` }} />
    </div>
  );
}
