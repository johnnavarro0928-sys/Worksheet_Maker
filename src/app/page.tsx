"use client";

import { Edit3, Eye, Library, Save, Printer, FileText, Download, PencilRuler, LayoutTemplate, Plus, BookOpen, Loader2, ArrowUp, ArrowDown, Trash2, CheckCircle2 } from "lucide-react";
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
    instructions: "General Directions: Read the specific directions for each part carefully. Strictly no erasures allowed."
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
    if (!generateConfig.topic) {
      alert("Please enter a topic first.");
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
      {/* Sidebar */}
      <aside className="sidebar neu-flat">
        <div style={{ padding: '0 5px', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: '#007AFF' }}>
            <PencilRuler size={20} /> QUIZ GENERATOR
          </h2>
          {activeSection && (
            <div style={{ fontSize: '12px', background: '#e3f2fd', color: '#007AFF', padding: '4px 8px', borderRadius: '6px', marginTop: '6px', fontWeight: 'bold' }}>
              Targeting: {activeSection.title}
            </div>
          )}
        </div>

        <div className="form-group">
          <label>Topic</label>
          <input
            type="text"
            className="neu-input"
            placeholder="e.g. Solar System..."
            value={generateConfig.topic}
            onChange={(e) => setGenerateConfig({ ...generateConfig, topic: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Learning Competency <span style={{ fontSize: '11px', opacity: 0.6 }}>(Optional)</span></label>
          <input
            type="text"
            className="neu-input"
            placeholder="e.g. Identify planets..."
            value={generateConfig.competency}
            onChange={(e) => setGenerateConfig({ ...generateConfig, competency: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Specific Objectives <span style={{ fontSize: '11px', opacity: 0.6 }}>(Optional)</span></label>
          <input
            type="text"
            className="neu-input"
            placeholder="e.g. Name inner vs outer planets..."
            value={generateConfig.objective}
            onChange={(e) => setGenerateConfig({ ...generateConfig, objective: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', gap: '16px' }}>
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

        <div style={{ display: 'flex', gap: '16px' }}>
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
          style={{ marginTop: '16px', padding: '14px', opacity: isGenerating ? 0.7 : 1, fontSize: '16px' }}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <PencilRuler size={18} />}
          {isGenerating ? "Generating..." : `Add to ${activeSection?.title.split('.')[0] || 'Section'}`}
        </button>

        <hr style={{ border: 'none', borderTop: '1px solid var(--shadow-dark)', margin: '20px 0', opacity: 0.5 }} />

        <div style={{ padding: '0 5px', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={18} /> Quiz Headers & Instructions
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

        <div className="form-group">
          <label>Teacher Name</label>
          <input type="text" className="neu-input" placeholder="Enter teacher name" value={quizData.teacher} onChange={(e) => setQuizData({ ...quizData, teacher: e.target.value })} />
        </div>

        <div className="form-group">
          <label>General Instructions</label>
          <textarea className="neu-input" rows={3} style={{ resize: 'vertical' }} value={quizData.instructions} onChange={(e) => setQuizData({ ...quizData, instructions: e.target.value })}></textarea>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="topbar neu-flat">
          <div style={{ display: 'flex', gap: '16px' }}>
            <button className="neu-button-solid bg-ios-gray">
              <Edit3 size={18} /> Edit
            </button>
            <button className="neu-button-solid bg-ios-green">
              <Eye size={18} /> Preview
            </button>
            <button className="neu-button-solid bg-ios-gray">
              <Library size={18} /> Library
            </button>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button className="neu-button-solid bg-ios-orange">
              <Save size={18} /> Save
            </button>
            <button className="neu-button-solid bg-ios-gray">
              <Printer size={18} /> Print
            </button>
            <button className="neu-button-solid bg-ios-red">
              <FileText size={18} /> PDF
            </button>
            <button className="neu-button-solid bg-ios-blue" onClick={handleExportDocx}>
              <Download size={18} /> DOCX
            </button>
          </div>
        </header>

        <section className="preview-area neu-flat" style={{ gap: '20px' }}>
          <div className="neu-pressed" style={{ padding: '32px', flex: 1, overflowY: 'auto', borderRadius: '16px' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', background: '#ffffff', borderRadius: '8px', padding: '40px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', color: '#000' }}>
              
              {/* Document Header */}
              <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>{quizData.title}</h1>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px', fontSize: '14px' }}>
                <div><strong>School:</strong> {quizData.school || "________________________"}</div>
                <div><strong>Teacher:</strong> {quizData.teacher || "________________________"}</div>
                <div><strong>Name:</strong> ________________________</div>
                <div><strong>Score:</strong> _______ / {totalQuestions}</div>
                <div><strong>Grade/Section:</strong> _________________</div>
                <div><strong>Date:</strong> ________________________</div>
              </div>

              {quizData.instructions && (
                <div style={{ marginBottom: '32px', fontSize: '14px', background: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
                  <strong>General Directions:</strong> {quizData.instructions}
                </div>
              )}

              {/* Sections List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                {sections.map((sec, secIdx) => {
                  const isActive = sec.id === activeSectionId;
                  return (
                    <div
                      key={sec.id}
                      onClick={() => handleSelectSection(sec)}
                      style={{
                        padding: '20px',
                        borderRadius: '8px',
                        border: isActive ? '2px solid #007AFF' : '1px dashed #ccc',
                        background: isActive ? '#f4f8ff' : '#fafafa',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                    >
                      {isActive && (
                        <div style={{ position: 'absolute', top: '-12px', right: '16px', background: '#007AFF', color: '#fff', fontSize: '11px', fontWeight: 'bold', padding: '2px 8px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckCircle2 size={12} /> ACTIVE SECTION
                        </div>
                      )}

                      {/* Section Title & Controls Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            value={sec.title}
                            onChange={(e) => handleUpdateSection(sec.id, { title: e.target.value })}
                            style={{ fontSize: '16px', fontWeight: 'bold', width: '100%', border: 'none', background: 'transparent', borderBottom: '1px solid #ddd', paddingBottom: '4px' }}
                          />
                          <input
                            type="text"
                            value={sec.instructions}
                            onChange={(e) => handleUpdateSection(sec.id, { instructions: e.target.value })}
                            placeholder="Section instructions..."
                            style={{ fontSize: '13px', color: '#555', width: '100%', border: 'none', background: 'transparent', marginTop: '6px', fontStyle: 'italic' }}
                          />
                        </div>

                        {/* Controls Toolbar */}
                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <button
                            title="Move Up"
                            disabled={secIdx === 0}
                            onClick={() => handleMoveSection(secIdx, 'up')}
                            style={{ padding: '6px', borderRadius: '4px', border: 'none', background: '#e0e0e0', cursor: secIdx === 0 ? 'not-allowed' : 'pointer', opacity: secIdx === 0 ? 0.4 : 1 }}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            title="Move Down"
                            disabled={secIdx === sections.length - 1}
                            onClick={() => handleMoveSection(secIdx, 'down')}
                            style={{ padding: '6px', borderRadius: '4px', border: 'none', background: '#e0e0e0', cursor: secIdx === sections.length - 1 ? 'not-allowed' : 'pointer', opacity: secIdx === sections.length - 1 ? 0.4 : 1 }}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            title="Add Question"
                            onClick={() => handleAddQuestion(sec.id)}
                            style={{ padding: '6px 10px', borderRadius: '4px', border: 'none', background: '#007AFF', color: '#fff', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Plus size={14} /> Question
                          </button>
                          <button
                            title="Delete Section"
                            onClick={() => handleDeleteSection(sec.id)}
                            style={{ padding: '6px', borderRadius: '4px', border: 'none', background: '#ff3b30', color: '#fff', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Questions List */}
                      {sec.questions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#888', fontSize: '13px', fontStyle: 'italic', border: '1px dashed #e0e0e0', borderRadius: '6px' }}>
                          No questions in this section yet. Click "Generate Quiz" in the sidebar or "+ Question" above.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
                          {sec.questions.map((q, qIdx) => (
                            <div key={q.id || qIdx} style={{ fontSize: '15px', background: '#fff', padding: '12px', borderRadius: '6px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span style={{ fontWeight: 'bold' }}>{qIdx + 1}.</span>
                                <input
                                  type="text"
                                  value={q.text}
                                  onChange={(e) => handleUpdateQuestion(sec.id, q.id, e.target.value)}
                                  style={{ flex: 1, border: 'none', background: 'transparent', borderBottom: '1px dotted #ccc', fontSize: '15px' }}
                                />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteQuestion(sec.id, q.id);
                                  }}
                                  style={{ border: 'none', background: 'transparent', color: '#ff3b30', cursor: 'pointer', padding: '2px' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>

                              {/* Question Type specific displays */}
                              {q.options && q.options.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingLeft: '24px', marginTop: '8px' }}>
                                  {q.options.map((opt, i) => (
                                    <div key={i} style={{ fontSize: '14px', color: '#333' }}>{String.fromCharCode(65 + i)}. {opt}</div>
                                  ))}
                                </div>
                              )}
                              {sec.type === 'True or False' && (
                                <div style={{ display: 'flex', gap: '24px', paddingLeft: '24px', marginTop: '8px', fontSize: '14px', color: '#555' }}>
                                  <div>___ True</div>
                                  <div>___ False</div>
                                </div>
                              )}
                              {(sec.type === 'Identification' || sec.type === 'Problem Solving') && (
                                <div style={{ paddingLeft: '24px', marginTop: '8px', fontSize: '14px', color: '#555' }}>
                                  Answer: ________________________________________
                                </div>
                              )}
                              {sec.type === 'Essay' && (
                                <div style={{ paddingLeft: '24px', marginTop: '8px', fontSize: '14px', color: '#555' }}>
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
          <div className="neu-flat" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#555' }}>
              + ADD NEW SECTION TO WORKSHEET
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button className="neu-button" onClick={() => handleAddSection('Multiple Choice')}>
                <Plus size={16} /> Part: Multiple Choice
              </button>
              <button className="neu-button" onClick={() => handleAddSection('True or False')}>
                <Plus size={16} /> Part: True or False
              </button>
              <button className="neu-button" onClick={() => handleAddSection('Identification')}>
                <Plus size={16} /> Part: Identification
              </button>
              <button className="neu-button" onClick={() => handleAddSection('Problem Solving')}>
                <Plus size={16} /> Part: Problem Solving
              </button>
              <button className="neu-button" onClick={() => handleAddSection('Essay')}>
                <Plus size={16} /> Part: Essay
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
