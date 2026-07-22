"use client";

import { Edit3, Eye, Library, Save, Printer, FileText, Download, PencilRuler, Plus, BookOpen, Loader2, ArrowUp, ArrowDown, Trash2, CheckCircle2, Bookmark } from "lucide-react";
import { generateDocx } from "../utils/exportDocs";
import { useState } from "react";
import { Question, Section, WorksheetData } from "../types";

const ROMAN_NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

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

  // Section Management Handlers
  const handleSelectSection = (sec: Section) => {
    setActiveSectionId(sec.id);
    setGenerateConfig((prev) => ({ ...prev, type: sec.type }));
  };

  const handleAddSection = (type: string) => {
    const nextIndex = sections.length;
    const roman = ROMAN_NUMERALS[nextIndex] || `${nextIndex + 1}`;
    const newSection: Section = {
      id: `sec-${Date.now()}`,
      title: `PART ${roman}. ${type.toUpperCase()}`,
      type: type,
      instructions: getDefaultInstructions(type),
      questions: []
    };

    setSections((prev) => [...prev, newSection]);
    setActiveSectionId(newSection.id);
    setGenerateConfig((prev) => ({ ...prev, type: type }));
  };

  const handleDeleteSection = (secId: string) => {
    if (sections.length <= 1) {
      alert("Worksheet must have at least one section.");
      return;
    }
    const updated = sections.filter((s) => s.id !== secId);
    setSections(updated);
    if (activeSectionId === secId) {
      setActiveSectionId(updated[0].id);
      setGenerateConfig((prev) => ({ ...prev, type: updated[0].type }));
    }
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

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
    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, ...updates } : s))
    );
  };

  const handleAddQuestion = (secId: string) => {
    const targetSec = sections.find((s) => s.id === secId);
    if (!targetSec) return;

    const newQ: Question = {
      id: `q-${Date.now()}`,
      text: "Enter your question text here...",
      options: targetSec.type === 'Multiple Choice' ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined,
      correctAnswer: 0
    };

    setSections((prev) =>
      prev.map((s) => (s.id === secId ? { ...s, questions: [...s.questions, newQ] } : s))
    );
  };

  const handleDeleteQuestion = (secId: string, qId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === secId
          ? { ...s, questions: s.questions.filter((q) => q.id !== qId) }
          : s
      )
    );
  };

  const handleUpdateQuestion = (secId: string, qId: string, newText: string) => {
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
    await generateDocx(fullWorksheet);
  };

  const handleGenerate = async () => {
    if (!generateConfig.topic || !generateConfig.competency) {
      alert("Please enter both Topic and Learning Competency before generating.");
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(generateConfig)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        alert(`Generation Error (${res.status}): ${errorData.error || res.statusText || 'Failed to generate questions'}`);
        return;
      }

      const data = await res.json();
      if (data.questions && data.questions.length > 0) {
        setSections((prev) =>
          prev.map((s) =>
            s.id === activeSectionId
              ? { ...s, questions: [...s.questions, ...data.questions] }
              : s
          )
        );
      } else {
        alert("No questions returned from generator.");
      }
    } catch (e: any) {
      alert("Network error: Unable to connect to generator API.");
    } finally {
      setIsGenerating(false);
    }
  };

  const activeSection = sections.find((s) => s.id === activeSectionId) || sections[0];
  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);

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
            onChange={(e) => setGenerateConfig({ ...generateConfig, topic: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Learning Competency</label>
          <input
            type="text"
            className="neu-input"
            placeholder="e.g. Identify planets and orbits..."
            value={generateConfig.competency}
            onChange={(e) => setGenerateConfig({ ...generateConfig, competency: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Specific Objectives <span style={{ fontSize: '10px', opacity: 0.6 }}>(Optional)</span></label>
          <input
            type="text"
            className="neu-input"
            placeholder="e.g. Name inner vs outer planets..."
            value={generateConfig.objective}
            onChange={(e) => setGenerateConfig({ ...generateConfig, objective: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Grade</label>
            <select className="neu-input" value={generateConfig.grade} onChange={(e) => setGenerateConfig({ ...generateConfig, grade: e.target.value })}>
              <option>Grade 8</option>
              <option>Grade 9</option>
              <option>Grade 10</option>
              <option>Grade 11</option>
              <option>Grade 12</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Subject</label>
            <select className="neu-input" value={generateConfig.subject} onChange={(e) => setGenerateConfig({ ...generateConfig, subject: e.target.value })}>
              <option>Science</option>
              <option>Mathematics</option>
              <option>English</option>
              <option>History</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Question Type</label>
          <select
            className="neu-input"
            value={generateConfig.type}
            onChange={(e) => {
              const newType = e.target.value;
              setGenerateConfig({ ...generateConfig, type: newType });
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
            <select className="neu-input" value={generateConfig.difficulty} onChange={(e) => setGenerateConfig({ ...generateConfig, difficulty: e.target.value })}>
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
              onChange={(e) => setGenerateConfig({ ...generateConfig, count: parseInt(e.target.value) || 1 })}
              min={1}
              max={50}
            />
          </div>
        </div>

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

        <div style={{ padding: '0 5px', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={16} /> Quiz Headers & Info
          </h2>
        </div>

        <div className="form-group">
          <label>Quiz Title</label>
          <input type="text" className="neu-input" value={quizData.title} onChange={(e) => setQuizData({ ...quizData, title: e.target.value })} />
        </div>

        <div className="form-group">
          <label>School Name</label>
          <input type="text" className="neu-input" placeholder="Enter school name" value={quizData.school} onChange={(e) => setQuizData({ ...quizData, school: e.target.value })} />
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>School Year</label>
            <input type="text" className="neu-input" placeholder="e.g. S.Y. 2026-2027" value={quizData.schoolYear} onChange={(e) => setQuizData({ ...quizData, schoolYear: e.target.value })} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Term</label>
            <input type="text" className="neu-input" placeholder="e.g. FIRST TERM" value={quizData.term} onChange={(e) => setQuizData({ ...quizData, term: e.target.value })} />
          </div>
        </div>

        <div className="form-group">
          <label>Teacher Name</label>
          <input type="text" className="neu-input" placeholder="Enter teacher name" value={quizData.teacher} onChange={(e) => setQuizData({ ...quizData, teacher: e.target.value })} />
        </div>

        <div className="form-group">
          <label>General Directions</label>
          <textarea className="neu-input" rows={3} style={{ resize: 'vertical' }} value={quizData.instructions} onChange={(e) => setQuizData({ ...quizData, instructions: e.target.value })}></textarea>
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
            <button className="neu-button-solid bg-ios-gray">
              <Library size={16} /> Library
            </button>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="neu-button-solid bg-ios-orange">
              <Save size={16} /> Save
            </button>
            <button className="neu-button-solid bg-ios-gray">
              <Printer size={16} /> Print
            </button>
            <button className="neu-button-solid bg-ios-red">
              <FileText size={16} /> PDF
            </button>
            <button className="neu-button-solid bg-ios-blue" onClick={handleExportDocx}>
              <Download size={16} /> DOCX
            </button>
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
                    style={{ height: '1.07cm', width: '2.03cm', objectFit: 'contain' }}
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
                          No questions in this section yet. Click "Add to Section" in the sidebar or "+ Question" above.
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
                                  {q.options.map((opt, i) => (
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
        </section>
      </main>

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
