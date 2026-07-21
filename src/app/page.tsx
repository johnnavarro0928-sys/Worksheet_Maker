"use client";

import { Edit3, Eye, Library, Save, Printer, FileText, Download, PencilRuler, LayoutTemplate, Plus, BookOpen, Loader2 } from "lucide-react";
import { generateDocx } from "../utils/exportDocs";
import { useState } from "react";
import { Question } from "../types";

export default function Home() {
  // Quiz Header State
  const [quizData, setQuizData] = useState({
    title: "Written Work # 1",
    teacher: "",
    school: "",
    instructions: "General Directions: This examination consists of multiple sections. Read the specific directions for each part carefully. Strictly no erasures allowed."
  });

  // AI Generation Form State
  const [generateConfig, setGenerateConfig] = useState({
    topic: "",
    competency: "",
    grade: "Grade 10",
    subject: "Science",
    type: "Multiple Choice",
    difficulty: "Average",
    count: 5,
    modelName: "google/gemini-2.5-flash:free"
  });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExportDocx = async () => {
    // Merge quiz settings and generated questions for export
    await generateDocx({ ...quizData, questions });
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
      
      const data = await res.json();
      if (data.questions) {
        setQuestions(data.questions);
      } else {
        alert("Failed to generate questions. " + (data.error || ""));
      }
    } catch (e) {
      alert("Error calling generator.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar */}
      <aside className="sidebar neu-flat">
        <div style={{ padding: '0 5px', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', color: '#007AFF' }}>
            <PencilRuler size={20} /> QUIZ GENERATOR
          </h2>
        </div>
        
        <div className="form-group">
          <label>Topic</label>
          <input 
            type="text" 
            className="neu-input" 
            placeholder="e.g. Solar System..." 
            value={generateConfig.topic}
            onChange={(e) => setGenerateConfig({...generateConfig, topic: e.target.value})}
          />
        </div>
        
        <div className="form-group">
          <label>Learning Competency</label>
          <input 
            type="text" 
            className="neu-input" 
            placeholder="e.g. Identify planets..." 
            value={generateConfig.competency}
            onChange={(e) => setGenerateConfig({...generateConfig, competency: e.target.value})}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Grade</label>
            <select className="neu-input" value={generateConfig.grade} onChange={(e) => setGenerateConfig({...generateConfig, grade: e.target.value})}>
              <option>Grade 8</option>
              <option>Grade 9</option>
              <option>Grade 10</option>
              <option>Grade 11</option>
              <option>Grade 12</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Subject</label>
            <select className="neu-input" value={generateConfig.subject} onChange={(e) => setGenerateConfig({...generateConfig, subject: e.target.value})}>
              <option>Science</option>
              <option>Mathematics</option>
              <option>English</option>
              <option>History</option>
            </select>
          </div>
        </div>
        
        <div className="form-group">
          <label>Question Type</label>
          <select className="neu-input" value={generateConfig.type} onChange={(e) => setGenerateConfig({...generateConfig, type: e.target.value})}>
            <option>Multiple Choice</option>
            <option>True or False</option>
            <option>Identification</option>
          </select>
        </div>

        <div className="form-group">
          <label>AI Model</label>
          <select className="neu-input" value={generateConfig.modelName} onChange={(e) => setGenerateConfig({...generateConfig, modelName: e.target.value})}>
            <option value="google/gemini-2.5-flash:free">Gemini 2.5 Flash (Fast)</option>
            <option value="meta-llama/llama-3-8b-instruct:free">Llama 3 8B (Open Source)</option>
            <option value="microsoft/phi-3-mini-128k-instruct:free">Microsoft Phi-3 (Stable)</option>
            <option value="google/gemma-2-9b-it:free">Gemma 2 9B (Google)</option>
            <option value="nousresearch/hermes-3-llama-3.1-405b:free">Hermes 3 (Capable)</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', gap: '16px' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Difficulty</label>
            <select className="neu-input" value={generateConfig.difficulty} onChange={(e) => setGenerateConfig({...generateConfig, difficulty: e.target.value})}>
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
              onChange={(e) => setGenerateConfig({...generateConfig, count: parseInt(e.target.value) || 1})}
              min={1} max={50}
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
          {isGenerating ? "Generating..." : "Generate Quiz"}
        </button>

        <hr style={{ border: 'none', borderTop: '1px solid var(--shadow-dark)', margin: '20px 0', opacity: 0.5 }} />

        <div style={{ padding: '0 5px', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpen size={18} /> Quiz Headers & Instructions
          </h2>
        </div>
        
        <div className="form-group">
          <label>Quiz Title</label>
          <input type="text" className="neu-input" value={quizData.title} onChange={(e) => setQuizData({...quizData, title: e.target.value})} />
        </div>
        
        <div className="form-group">
          <label>School Name</label>
          <input type="text" className="neu-input" placeholder="Enter school name" value={quizData.school} onChange={(e) => setQuizData({...quizData, school: e.target.value})} />
        </div>

        <div className="form-group">
          <label>Teacher Name</label>
          <input type="text" className="neu-input" placeholder="Enter teacher name" value={quizData.teacher} onChange={(e) => setQuizData({...quizData, teacher: e.target.value})} />
        </div>

        <div className="form-group">
          <label>General Instructions</label>
          <textarea className="neu-input" rows={4} style={{ resize: 'vertical' }} value={quizData.instructions} onChange={(e) => setQuizData({...quizData, instructions: e.target.value})}></textarea>
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

        <section className="preview-area neu-flat">
          {questions.length === 0 ? (
            <div className="neu-pressed" style={{ padding: '40px', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', borderRadius: '16px' }}>
              <div style={{ width: '90px', height: '90px', borderRadius: '50%', background: 'var(--bg-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '8px 8px 16px var(--shadow-dark), -8px -8px 16px var(--shadow-light)', marginBottom: '24px' }}>
                <LayoutTemplate size={40} color="var(--accent-color)" />
              </div>
              <h3 style={{ fontSize: '28px', marginBottom: '12px', fontWeight: '800', color: '#007AFF' }}>Start Building Your Quiz</h3>
              <p style={{ color: 'var(--text-muted)', maxWidth: '400px', lineHeight: 1.6, fontSize: '15px' }}>
                Use the Generator on the left to instantly create questions based on your topic.
              </p>
            </div>
          ) : (
            <div className="neu-pressed" style={{ padding: '32px', flex: 1, overflowY: 'auto', borderRadius: '16px' }}>
              <div style={{ maxWidth: '800px', margin: '0 auto', background: '#ffffff', borderRadius: '8px', padding: '40px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', color: '#000' }}>
                <h1 style={{ textAlign: 'center', fontSize: '24px', fontWeight: 'bold', marginBottom: '24px' }}>{quizData.title}</h1>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px', fontSize: '14px' }}>
                  <div><strong>Name:</strong> ________________________</div>
                  <div><strong>Score:</strong> _______ / {questions.length}</div>
                  <div><strong>Grade/Section:</strong> _________________</div>
                  <div><strong>Date:</strong> ________________________</div>
                </div>
                {quizData.instructions && (
                  <div style={{ marginBottom: '32px', fontSize: '14px' }}>
                    <strong>General Directions:</strong> {quizData.instructions}
                  </div>
                )}
                
                <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}>PART I. {generateConfig.type.toUpperCase()}</h2>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {questions.map((q, idx) => (
                    <div key={q.id || idx} style={{ fontSize: '15px' }}>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold' }}>{idx + 1}.</span>
                        <span>{q.text}</span>
                      </div>
                      {q.options && q.options.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', paddingLeft: '24px' }}>
                          {q.options.map((opt, i) => (
                            <div key={i}>{String.fromCharCode(65 + i)}. {opt}</div>
                          ))}
                        </div>
                      )}
                      {!q.options && generateConfig.type === 'True or False' && (
                        <div style={{ display: 'flex', gap: '24px', paddingLeft: '24px' }}>
                          <div>___ True</div>
                          <div>___ False</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <div className="neu-flat" style={{ padding: '20px', display: 'flex', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <button className="neu-button"><Plus size={16} /> Multiple Choice</button>
            <button className="neu-button"><Plus size={16} /> True or False</button>
            <button className="neu-button"><Plus size={16} /> Identification</button>
            <button className="neu-button"><Plus size={16} /> Problem Solving</button>
            <button className="neu-button"><Plus size={16} /> Essay</button>
          </div>
        </section>
      </main>

      {/* Animation Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}} />
    </div>
  );
}
