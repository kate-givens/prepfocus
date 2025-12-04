import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, query, where, 
  onSnapshot, serverTimestamp, updateDoc, doc, getDocs 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { 
  CheckCircle2, XCircle, AlertCircle, 
  BrainCircuit, LogOut, Activity, BarChart3, Trophy, ArrowRight,
  BookOpen, Plus, Save, Trash2, Library,
  ClipboardList, Microscope, ScanEye, GraduationCap, FastForward, Mail, User as UserIcon, MessageCircle, Send, X, RefreshCcw, Clock, AlertTriangle
} from 'lucide-react';

/* ==========================================
  CONFIGURATION & KEYS
  ==========================================
*/
// 🔴 STEP 1: PASTE YOUR GEMINI API KEY HERE 🔴
const GEMINI_API_KEY = "AIzaSyARwfCkqtW3OMo54lsjEDQFCPYnz0VKXmw"; 

// Global declarations for injected variables
declare global {
  const __app_id: string | undefined;
  const __firebase_config: string | undefined;
  const __initial_auth_token: string | undefined;
}

// 🟢 STEP 2: YOUR FIREBASE CONFIGURATION 🟢
const productionConfig = {
  apiKey: "AIzaSyCn6MxYS9T_G0NepHzOpdPtD7uA65_0p1w",
  authDomain: "focus-prep.firebaseapp.com",
  projectId: "focus-prep",
  storageBucket: "focus-prep.firebasestorage.app",
  messagingSenderId: "930884147866",
  appId: "1:930884147866:web:acf74cb57897f12f18dd23",
  measurementId: "G-R4ZQ1Q7EK4"
};

// Universal Config Loader
let firebaseConfigToUse = productionConfig;
try {
  if (typeof __firebase_config !== 'undefined') {
    firebaseConfigToUse = JSON.parse(__firebase_config);
  }
} catch (e) {
  // Ignore error and use production config
}

const app = initializeApp(firebaseConfigToUse);
const auth = getAuth(app);
const db = getFirestore(app);

// Dynamic App ID
let appId = "focus-prep-live";
try {
  if (typeof __app_id !== 'undefined') {
    appId = __app_id;
  }
} catch (e) {
  // Ignore error
}

/* ==========================================
  TYPES & INTERFACES
  ==========================================
*/
interface UserProfile {
  id: string;
  uid: string;
  name: string;
  email?: string;
  role: string;
  focusArea: string;
  mastery: number;
  streak: number;
  lastActive: any; // Firestore Timestamp
  diagnosticCompleted: boolean;
  weaknesses: string[];
  initialMastery?: number;
}

/* ==========================================
  SAT ARCHITECTURE & WEIGHTS
  ==========================================
*/
const SAT_STRUCTURE: Record<string, Record<string, string[]>> = {
  "Reading and Writing": {
    "Information and Ideas": [
      "Central Ideas and Details",
      "Inferences",
      "Command of Evidence"
    ],
    "Craft and Structure": [
      "Words in Context",
      "Text Structure and Purpose",
      "Cross-Text Connections"
    ],
    "Expression of Ideas": [
      "Rhetorical Synthesis",
      "Transitions"
    ],
    "Standard English Conventions": [
      "Boundaries",
      "Form, Structure, and Sense"
    ]
  },
  "Math": {
    "Algebra": [
      "Linear equations in one variable",
      "Linear functions",
      "Linear equations in two variables",
      "Systems of two linear equations in two variables",
      "Linear inequalities in one or two variables"
    ],
    "Advanced Math": [
      "Nonlinear functions",
      "Nonlinear equations in one variable",
      "Systems of equations in two variables",
      "Equivalent expressions"
    ],
    "Problem-Solving and Data Analysis": [
      "Ratios, rates, proportional relationships, and units",
      "Percentages",
      "One-variable data: Distributions and measures of center and spread",
      "Two-variable data: Models and scatterplots",
      "Probability and conditional probability",
      "Inference from sample statistics and margin of error",
      "Evaluating statistical claims: Observational studies and experiments"
    ],
    "Geometry and Trigonometry": [
      "Area and volume",
      "Lines, angles, and triangles",
      "Right triangles and trigonometry",
      "Circles"
    ]
  }
};

// Strategic Weights (Urgency Multipliers)
const DOMAIN_WEIGHTS: Record<string, number> = {
  "Craft and Structure": 0.28,
  "Information and Ideas": 0.26,
  "Standard English Conventions": 0.26,
  "Expression of Ideas": 0.20,
  "Algebra": 0.35,
  "Advanced Math": 0.35,
  "Problem-Solving and Data Analysis": 0.15,
  "Geometry and Trigonometry": 0.15
};

/* ==========================================
  HELPER: TEXT FORMATTER
  ==========================================
*/
const formatText = (text: any) => {
  if (text === null || text === undefined) return "";
  let str = String(text);

  str = str.replace(/\\%/g, '%');                  
  str = str.replace(/\\overline{([^}]+)}/g, '$1'); 
  str = str.replace(/\\approx/g, '≈');             
  str = str.replace(/\\cdot/g, '·');               
  str = str.replace(/\\le/g, '≤');                 
  str = str.replace(/\\ge/g, '≥');                 
  str = str.replace(/\\times/g, '×');              
  str = str.replace(/\\neq/g, '≠');                
  str = str.replace(/\\pi/g, 'π');                 
  str = str.replace(/\\sqrt{([^}]+)}/g, '√$1');    
  str = str.replace(/\\sqrt/g, '√');
  
  const parts = str.split(/(\*\*.*?\*\*)/g);
  
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-indigo-900 bg-indigo-50 px-1 rounded">{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
};

/* ==========================================
  THE "BRAIN" - DYNAMIC PROMPTING
  ==========================================
*/

const callGemini = async (apiKey: string, prompt: string) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        }),
      }
    );
    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Robust JSON Sanitizer
      const PLACEHOLDERS: Record<string, string> = {
        '\\\"': '___QUOTE___',
        '\\\\': '___BACKSLASH___',
        '\\/': '___SLASH___',
        '\\b': '___B___',
        '\\f': '___F___',
        '\\n': '___N___',
        '\\r': '___R___',
        '\\t': '___T___'
      };
      
      for (const [esc, ph] of Object.entries(PLACEHOLDERS)) {
         text = text.split(esc).join(ph);
      }
      
      // Escape invalid backslashes
      text = text.replace(/\\/g, '\\\\');
      
      // Restore valid escapes
      for (const [esc, ph] of Object.entries(PLACEHOLDERS)) {
         text = text.split(ph).join(esc);
      }
    }
    
    try {
      return JSON.parse(text);
    } catch (parseError) {
      if (prompt.includes("Return plain text")) return text;
      console.error("JSON Parse Failed. Raw Text:", text);
      throw parseError; 
    }
  } catch (error) {
    console.error("AI Gen Error", error);
    return null;
  }
};

// --- 1. Standard Drill Generator ---
const generateAIQuiz = async (topic: string, currentMastery: number, dbInstance: any) => {
  let promptData: any = null;
  let examplesText = "";
  
  let difficultyTier = 'level1';
  if (currentMastery >= 25 && currentMastery < 75) difficultyTier = 'level2';
  if (currentMastery >= 75) difficultyTier = 'level3';

  const difficultyLabel = difficultyTier === 'level1' ? "Foundational/Easy" 
                        : difficultyTier === 'level2' ? "Medium/Standard" 
                        : "Hard/Advanced";

  try {
    const q = query(collection(dbInstance, 'artifacts', appId, 'public', 'data', 'prompt_templates'), where('skill', '==', topic));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const customData = snapshot.docs[0].data();
      const tieredExamples = customData[`examples_${difficultyTier}`] || customData.examples || [];
      promptData = { basePrompt: customData.basePrompt, examples: tieredExamples };
    }
  } catch (e) { console.warn("Fetch warning", e); }

  if (promptData && promptData.examples.length > 0) {
    examplesText = promptData.examples.map((ex: any, i: number) => `
    REF ${i+1}: Question: "${ex.question ? ex.question.substring(0, 50) : ""}..." | Correct: ${ex.correct} | Trap: ${ex.logic}`).join("\n");
  }

  const systemPrompt = `
    ${promptData?.basePrompt || `Expert SAT tutor. Skill: "${topic}".`}
    GOAL: Create 5 distinct multiple-choice questions for "${topic}".
    DIFFICULTY: ${difficultyLabel}.
    ${examplesText ? `MIMIC THESE EXAMPLES:\n${examplesText}` : ""}
    CRITICAL: JSON ONLY. Array of 5 objects.
    FORMATTING: 
    - Use **bold** for key terms.
    - Math uses Unicode (e.g. 1/2, x², √). NO LaTeX backslashes like \\overline.
    STRICT JSON RULES: Escape all double quotes within strings (\\").
    Structure: [{"question": "...", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "..."}]
  `;

  return await callGemini(GEMINI_API_KEY, systemPrompt);
};

// --- 2. Diagnostic Generator (BATCHED) ---
const generateDiagnosticBatch = async (subject: string, distribution: string[]) => {
    const systemPrompt = `
      You are an expert SAT Diagnostic creator for ${subject}.
      GOAL: Create exactly ${distribution.length} multiple-choice questions based on this distribution:
      ${distribution.join(", ")}
      
      DIFFICULTY: Mixed (Easy/Medium/Hard) to assess true level.
      
      CRITICAL:
      1. Return valid JSON Array of ${distribution.length} objects.
      2. Tag each object with the "domain" field matching the requested domain.
      3. Use **bold** for emphasis.
      4. NO LaTeX. Use plain text (e.g. "line AB", "10%", "x^2").
      
      Structure:
      [
        {
          "domain": "Algebra",
          "question": "...",
          "options": ["...", "...", "...", "..."],
          "correctIndex": 0,
          "explanation": "..."
        },
        ...
      ]
    `;
    return await callGemini(GEMINI_API_KEY, systemPrompt);
};

const generateFullDiagnostic = async () => {
    const mathDist = ["Algebra", "Algebra", "Algebra", "Advanced Math", "Advanced Math", "Advanced Math", "Problem-Solving and Data Analysis", "Geometry and Trigonometry"];
    const readDist = ["Craft and Structure", "Craft and Structure", "Information and Ideas", "Information and Ideas", "Standard English Conventions", "Standard English Conventions", "Expression of Ideas", "Expression of Ideas"];

    try {
        const [mathQs, readQs] = await Promise.all([
            generateDiagnosticBatch("Math", mathDist),
            generateDiagnosticBatch("Reading & Writing", readDist)
        ]);

        if (!Array.isArray(mathQs) || !Array.isArray(readQs)) throw new Error("Invalid AI response");
        return [...mathQs, ...readQs];
    } catch (e) {
        console.error("Diagnostic Gen Failed", e);
        return null;
    }
};

// --- 3. Chat Tutor Generator ---
const generateTutorResponse = async (context: any, userMessage: string) => {
  const systemPrompt = `
    You are an encouraging but precise SAT Tutor in a chat with a student.
    
    CONTEXT:
    The Question: "${context.question}"
    Options: ${JSON.stringify(context.options)}
    Correct Answer: Option ${String.fromCharCode(65 + context.correctIndex)} ("${context.options[context.correctIndex]}")
    Student Selection: Option ${String.fromCharCode(65 + context.selectedOption)} ("${context.options[context.selectedOption]}")
    
    STUDENT ASKS: "${userMessage}"
    
    INSTRUCTIONS:
    1. Answer the student directly.
    2. Keep it brief (2-3 sentences max).
    3. Use **bold**.
    5. Do NOT return JSON. Return plain text/markdown.
  `;

  return await callGemini(GEMINI_API_KEY, systemPrompt);
};

/* ==========================================
  COMPONENTS
  ==========================================
*/

const Spinner = ({text}: {text?: string}) => (
  <div className="flex flex-col justify-center items-center p-8 space-y-4">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
    {text && <p className="text-slate-500 text-sm font-medium animate-pulse">{text}</p>}
  </div>
);

// --- View 3: Teacher/Admin Dashboard ---
const TeacherView = ({ onLogout }: { onLogout: () => void }) => {
  const [skills, setSkills] = useState<any[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<any>(null); 
  const [isEditing, setIsEditing] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [activeTab, setActiveTab] = useState('level1');
  const [examplesL1, setExamplesL1] = useState<any[]>([]);
  const [examplesL2, setExamplesL2] = useState<any[]>([]);
  const [examplesL3, setExamplesL3] = useState<any[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'prompt_templates'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSkills(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, []);

  const handleSelectSkill = (skill: any) => {
    setSelectedSkill(skill);
    setDomainInput(skill.domain);
    setSkillInput(skill.skill);
    setPromptInput(skill.basePrompt);
    setExamplesL1(skill.examples_level1 || []);
    setExamplesL2(skill.examples_level2 || []);
    setExamplesL3(skill.examples_level3 || (skill.examples || [])); 
    setIsEditing(true);
    setActiveTab('level3'); 
  };

  const handleNewSkill = () => {
    setSelectedSkill(null);
    setDomainInput("");
    setSkillInput("");
    setPromptInput('You are an expert SAT content writer specializing in...');
    setExamplesL1([]);
    setExamplesL2([]);
    setExamplesL3([]);
    setIsEditing(true);
    setShowPicker(true);
    setActiveTab('level1');
  };

  const pickOfficialSkill = (domain: string, skill: string) => {
    setDomainInput(domain);
    setSkillInput(skill);
    setShowPicker(false);
  };

  const handleSave = async () => {
    const data = {
      domain: domainInput,
      skill: skillInput,
      basePrompt: promptInput,
      examples_level1: examplesL1,
      examples_level2: examplesL2,
      examples_level3: examplesL3,
      updatedAt: serverTimestamp()
    };

    if (selectedSkill) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'prompt_templates', selectedSkill.id), data);
    } else {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'prompt_templates'), data);
    }
    setIsEditing(false);
    setSelectedSkill(null);
  };

  const getCurrentExamples = () => {
    if (activeTab === 'level1') return examplesL1;
    if (activeTab === 'level2') return examplesL2;
    return examplesL3;
  };
  const setCurrentExamples = (newEx: any[]) => {
    if (activeTab === 'level1') setExamplesL1(newEx);
    else if (activeTab === 'level2') setExamplesL2(newEx);
    else setExamplesL3(newEx);
  };

  const handleAddExample = () => {
    setCurrentExamples([...getCurrentExamples(), { question: "", correct: "", logic: "" }]);
  };

  const updateExample = (index: number, field: string, value: string) => {
    const current = getCurrentExamples();
    const newEx = [...current];
    newEx[index][field] = value;
    setCurrentExamples(newEx);
  };

  const removeExample = (index: number) => {
    const current = getCurrentExamples();
    const newEx = current.filter((_, i) => i !== index);
    setCurrentExamples(newEx);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="bg-slate-900 text-white p-4 shadow-md flex justify-between items-center sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <BrainCircuit className="text-emerald-400" />
          <span className="font-bold text-lg">AI Architect</span>
        </div>
        <button onClick={onLogout} className="text-slate-400 hover:text-white text-sm">Exit</button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/3 max-w-xs bg-white border-r border-slate-200 overflow-y-auto p-4 hidden md:block">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-bold text-slate-700">Content Library</h2>
            <button onClick={handleNewSkill} className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100"><Plus size={18} /></button>
          </div>
          <div className="space-y-2">
            {skills.map(s => (
              <button key={s.id} onClick={() => handleSelectSkill(s)} className={`w-full text-left p-3 rounded-lg border transition ${selectedSkill?.id === s.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-100 text-slate-600 hover:border-slate-300'}`}>
                <div className="font-bold text-sm truncate">{s.skill}</div>
                <div className="text-xs opacity-70 truncate">{s.domain}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {isEditing ? (
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex justify-between items-center">
                <h1 className="text-2xl font-black text-slate-800">{selectedSkill ? "Edit Skill Logic" : "New Skill Logic"}</h1>
                <div className="flex gap-2">
                   <button onClick={() => setIsEditing(false)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                   <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 flex items-center gap-2"><Save size={18} /> Save Logic</button>
                </div>
              </div>

              {showPicker && (
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl mb-6">
                  <h3 className="text-sm font-bold text-indigo-800 mb-3 flex items-center gap-2"><BookOpen size={16} /> Select Official Skill to Autofill</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-48 overflow-y-auto pr-2">
                    {Object.entries(SAT_STRUCTURE).map(([section, domains]) => (
                      Object.entries(domains).map(([domain, skillList]) => (
                        <div key={domain}>
                          <div className="text-xs font-bold text-slate-400 uppercase mb-1">{domain}</div>
                          {skillList.map(skill => (
                            <button key={skill} onClick={() => pickOfficialSkill(domain, skill)} className="block w-full text-left text-sm py-1 px-2 hover:bg-white rounded text-slate-600 hover:text-indigo-600 transition">{skill}</button>
                          ))}
                        </div>
                      ))
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Domain</label>
                  <input className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Skill Name</label>
                  <input className="w-full p-3 bg-white border border-slate-200 rounded-lg outline-none" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">AI Base Instruction</label>
                <textarea className="w-full p-4 h-32 bg-slate-900 text-emerald-400 font-mono text-sm rounded-lg outline-none" value={promptInput} onChange={(e) => setPromptInput(e.target.value)} />
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-end border-b pb-2">
                   <div>
                     <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Adaptive Difficulty Examples</label>
                     <div className="flex gap-2">
                        {['level1', 'level2', 'level3'].map(lvl => (
                          <button key={lvl} onClick={() => setActiveTab(lvl)} className={`px-3 py-1 rounded-t-lg text-sm font-bold flex items-center gap-2 ${activeTab === lvl ? 'bg-indigo-100 text-indigo-700 border-b-2 border-indigo-500' : 'bg-slate-100 text-slate-500'}`}>
                            {lvl === 'level1' ? 'Basics' : lvl === 'level2' ? 'Fluency' : 'Advanced'}
                          </button>
                        ))}
                     </div>
                   </div>
                  <button onClick={handleAddExample} className="text-xs flex items-center gap-1 text-indigo-600 font-bold hover:underline mb-2"><Plus size={14} /> Add Example</button>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 min-h-[200px]">
                    <div className="space-y-4">
                      {getCurrentExamples().map((ex, idx) => (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3 relative group">
                          <button onClick={() => removeExample(idx)} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 size={16} /></button>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="col-span-1 md:col-span-2">
                              <label className="text-xs font-bold text-slate-400">Question Snippet</label>
                              <input className="w-full p-2 text-sm border rounded bg-slate-50" value={ex.question} onChange={(e) => updateExample(idx, 'question', e.target.value)} />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-400">Correct Answer</label>
                              <input className="w-full p-2 text-sm border rounded bg-slate-50" value={ex.correct} onChange={(e) => updateExample(idx, 'correct', e.target.value)} />
                            </div>
                            <div>
                              <label className="text-xs font-bold text-slate-400">Distractor Logic</label>
                              <input className="w-full p-2 text-sm border rounded bg-slate-50 text-red-600" value={ex.logic} onChange={(e) => updateExample(idx, 'logic', e.target.value)} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
              <Library size={48} className="opacity-20" />
              <p>Select a skill from the left to edit its AI logic, or create a new one.</p>
              <button onClick={handleNewSkill} className="md:hidden p-3 bg-indigo-600 text-white rounded-lg font-bold">Create New Skill</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// --- View: Diagnostic Report Card (NEW) ---
const DiagnosticReportView = ({ reportData, onConfirm }: { reportData: any, onConfirm: () => void }) => {
  const { primaryFocus, priorities, initialMastery } = reportData;
  
  // Find the priority data object for the primary focus to get its specific stats
  const focusStats = priorities.find((p: any) => p.domain === primaryFocus);
  const focusAccuracy = focusStats ? Math.round(focusStats.accuracy * 100) : 0;
  const focusWeight = DOMAIN_WEIGHTS[primaryFocus] ? (DOMAIN_WEIGHTS[primaryFocus] * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto bg-slate-50 min-h-screen p-6 flex flex-col">
      <div className="text-center mb-8 animate-in slide-in-from-top-4">
        <div className="inline-flex p-4 bg-indigo-100 rounded-full mb-4 shadow-sm">
           <ScanEye className="w-12 h-12 text-indigo-600" />
        </div>
        <h1 className="text-3xl font-black text-slate-900 mb-2">Diagnostic Complete</h1>
        <p className="text-slate-500">We have analyzed your performance profile.</p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden mb-6 animate-in zoom-in-95 delay-100">
        <div className="bg-slate-900 p-6 text-white">
           <div className="flex justify-between items-center">
             <div>
                <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">Primary Focus Target</div>
                <div className="text-2xl font-bold">{primaryFocus}</div>
             </div>
             <div className="text-right">
                <div className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-1">Starting Level</div>
                <div className="text-2xl font-bold text-white">{Math.round(initialMastery)}%</div>
             </div>
           </div>
        </div>
        <div className="p-6 space-y-4">
           <div className="flex items-start gap-4">
              <AlertTriangle className="text-orange-500 shrink-0 mt-1" />
              <div>
                 <h3 className="font-bold text-slate-800">Why this target?</h3>
                 <p className="text-slate-600 text-sm mt-1 leading-relaxed">
                    Your accuracy in this domain was <strong>{focusAccuracy}%</strong>. 
                    Since this domain makes up roughly <strong>{focusWeight}%</strong> of the total SAT score, 
                    improving here will give you the fastest point gains.
                 </p>
              </div>
           </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-8 animate-in slide-in-from-bottom-4 delay-200">
         <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity size={18} className="text-slate-400" /> Performance Breakdown
         </h3>
         <div className="space-y-3">
            {priorities.map((p: any, i: number) => (
               <div key={i} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition">
                  <div className="flex-1">
                     <div className="text-sm font-medium text-slate-700">{p.domain}</div>
                     <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 max-w-[150px]">
                        <div 
                           className={`h-full rounded-full ${p.accuracy > 0.8 ? 'bg-green-500' : p.accuracy > 0.5 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                           style={{width: `${Math.max(5, p.accuracy * 100)}%`}}
                        ></div>
                     </div>
                  </div>
                  <div className="text-right">
                     <span className={`text-xs font-bold px-2 py-1 rounded ${p.accuracy > 0.8 ? 'bg-green-100 text-green-700' : p.accuracy > 0.5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                        {Math.round(p.accuracy * 100)}%
                     </span>
                  </div>
               </div>
            ))}
         </div>
      </div>

      <button 
        onClick={onConfirm}
        className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/20 transition flex items-center justify-center gap-2"
      >
         Start My Plan <ArrowRight size={20} />
      </button>
    </div>
  );
};

// --- View: Diagnostic Test ---
const DiagnosticView = ({ onComplete, onSkip }: { onComplete: (data: any) => void, onSkip: () => void }) => {
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, any>>({}); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes

  const loadQuestions = async () => {
    setLoading(true);
    setError(null);
    const q = await generateFullDiagnostic();
    if (q && Array.isArray(q) && q.length > 0) {
      setQuestions(q);
    } else {
      setError("Failed to generate diagnostic test. Please check your connection and try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  useEffect(() => {
    if (loading || !questions.length) return;
    if (timeLeft <= 0) {
        calculateResults(answers);
        return;
    }
    const timerId = setInterval(() => {
        setTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timerId);
  }, [timeLeft, loading, questions]);

  const handleAnswer = (index: number) => {
    const currentQ = questions[currentIndex];
    const isCorrect = index === currentQ.correctIndex;
    
    const newAnswers = { ...answers, [currentIndex]: { correct: isCorrect, domain: currentQ.domain } };
    setAnswers(newAnswers);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      calculateResults(newAnswers);
    }
  };

  const calculateResults = (finalAnswers: Record<number, any>) => {
    let domainScores: Record<string, {correct: number, total: number}> = {};
    Object.keys(DOMAIN_WEIGHTS).forEach(d => domainScores[d] = { correct: 0, total: 0 });

    questions.forEach((q, idx) => {
        if (domainScores[q.domain]) {
            domainScores[q.domain].total += 1;
            if (finalAnswers[idx] && finalAnswers[idx].correct) {
                domainScores[q.domain].correct += 1;
            }
        }
    });
    
    let priorities: any[] = [];
    Object.keys(domainScores).forEach(domain => {
      const stats = domainScores[domain];
      const accuracy = stats.total === 0 ? 0 : stats.correct / stats.total;
      // Urgency = (Inaccuracy) * (Weight)
      const urgency = (1 - accuracy) * (DOMAIN_WEIGHTS[domain] || 0.1);
      priorities.push({ domain, urgency, accuracy });
    });

    priorities.sort((a, b) => b.urgency - a.urgency);
    const primaryFocus = priorities[0].domain;
    const sortedWeaknesses = priorities.map(p => p.domain);
    
    // CALCULATE INITIAL MASTERY
    // We use the accuracy of the PRIMARY focus area to set the baseline.
    // If you got 0% right in Algebra, your mastery is 0. If 50%, it's 50.
    // We floor it at 5% just so the progress bar isn't totally invisible.
    const focusStats = priorities[0];
    const initialMastery = Math.max(5, focusStats.accuracy * 100);

    // Pass FULL data to the report view
    onComplete({ primaryFocus, priorities, sortedWeaknesses, initialMastery });
  };

  const formatTime = (seconds: any) => {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) return <Spinner text="Constructing 16-Question Diagnostic Battery..." />;
  
  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center space-y-4">
        <AlertCircle size={48} className="text-red-500" />
        <p className="text-slate-600 font-medium">{error}</p>
        <button 
            onClick={loadQuestions}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition"
        >
            <RefreshCcw size={18} /> Retry Generation
        </button>
        <button 
            onClick={onSkip}
            className="text-slate-400 hover:text-slate-600 text-sm font-medium"
        >
            Skip Diagnostic
        </button>
    </div>
  );

  const activeQ = questions[currentIndex];
  if (!activeQ) return null;

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen p-4 flex flex-col justify-center">
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2 text-indigo-600 font-bold">
            <Activity size={20} />
            <span>Diagnostic Scan</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1 font-mono font-bold px-2 py-1 rounded ${timeLeft < 120 ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                <Clock size={14} /> {formatTime(timeLeft)}
            </div>
            <button 
              onClick={onSkip} 
              className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition flex items-center gap-1"
              title="Skip Diagnostic"
            >
              Skip <FastForward size={12} />
            </button>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
             <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Question {currentIndex + 1} of {questions.length}
             </span>
             <span className="text-xs font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                {activeQ.domain}
             </span>
          </div>
          <p className="text-lg font-medium text-slate-800 leading-relaxed font-serif">
            {formatText(activeQ.question)}
          </p>
        </div>

        <div className="space-y-3">
          {activeQ.options.map((opt: any, idx: number) => (
            <button
              key={idx}
              onClick={() => handleAnswer(idx)}
              className="w-full p-4 rounded-xl text-left border-2 border-slate-100 bg-slate-50 hover:border-indigo-500 hover:bg-indigo-50 transition text-slate-600"
            >
              <span className="font-bold mr-3 opacity-50">{String.fromCharCode(65 + idx)}</span>
              {formatText(opt)}
            </button>
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-slate-400 mt-6">
        This initial test establishes your performance baseline.
      </p>
    </div>
  );
};

// --- View: Student Interface ---
const StudentView = ({ user, onLogout }: { user: User | null, onLogout: () => void }) => {
  const [mode, setMode] = useState('loading'); 
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  // Diagnostic Report Data State
  const [reportData, setReportData] = useState<any>(null);

  const [quizQuestions, setQuizQuestions] = useState<any[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [sessionScore, setSessionScore] = useState(0);
  const [difficultyTier, setDifficultyTier] = useState('Level 1');
  const [isSubmitting, setIsSubmitting] = useState(false); 
  
  // STEALTH TIMER
  const questionStartTime = useRef(Date.now());

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; text: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Routing Logic
  useEffect(() => {
    if (profile && mode === 'loading') {
      if (profile.diagnosticCompleted) {
        setMode('dashboard');
      } else {
        setMode('diagnostic');
      }
    }
  }, [profile, mode]);

  // Reset timer
  useEffect(() => {
    questionStartTime.current = Date.now();
  }, [currentQIndex, mode]);

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, showChat]);

  // Data Subscription
  useEffect(() => {
    if (!user) return;
    const qUser = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'), where('uid', '==', user.uid));
    
    const unsubUser = onSnapshot(qUser, (snapshot) => {
      if (!snapshot.empty) {
        const p = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as UserProfile;
        setProfile(p);
        
        // Mastery Tiers Updated: 0-25, 25-75, 75-100
        if (p.mastery < 25) setDifficultyTier('Foundational');
        else if (p.mastery < 75) setDifficultyTier('Standard');
        else setDifficultyTier('Elite');

      } else {
        setMode('setup'); 
      }
    });
    return () => unsubUser();
  }, [user]);

  const handleCreateProfile = async (name: string, email: string) => {
    if (!user) return;
    setIsSubmitting(true); 

    try {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'users'), {
          uid: user.uid,
          name: name,
          email: email, 
          role: 'student',
          focusArea: "Pending Diagnostic",
          streak: 0,
          lastActive: serverTimestamp(),
          mastery: 0,
          diagnosticCompleted: false,
          weaknesses: [] 
        });
        
        setMode('diagnostic'); 
    } catch (error) {
        console.error("Error creating profile:", error);
        setIsSubmitting(false); 
        alert("Failed to create profile. Please try again.");
    }
  };

  // Step 1: Receive data from Diagnostic View
  const handleDiagnosticComplete = (data: any) => {
    setReportData(data);
    setMode('report'); // Show the report card
  };

  // Step 2: Confirm and Save to DB
  const handleReportConfirm = async () => {
    if (profile && reportData) {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', profile.id);
      await updateDoc(userRef, {
        diagnosticCompleted: true,
        focusArea: reportData.primaryFocus,
        weaknesses: reportData.sortedWeaknesses,
        mastery: reportData.initialMastery // USE CALCULATED MASTERY
      });
      setMode('dashboard');
    }
  };

  const handleSkipDiagnostic = async () => {
    if (profile) {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', profile.id);
      await updateDoc(userRef, {
        diagnosticCompleted: true,
        focusArea: "General Practice",
        weaknesses: ["Algebra", "Words in Context", "Standard English Conventions"], 
        mastery: 40 
      });
      setMode('dashboard');
    }
  };

  const startDrill = async () => {
    setMode('drill');
    setIsGenerating(true);
    setQuizQuestions([]);
    setCurrentQIndex(0);
    setSessionScore(0);
    setFeedback(null);
    setSelectedOption(null);
    setShowChat(false);
    setChatMessages([]);
    questionStartTime.current = Date.now(); 

    try {
        const questions = await generateAIQuiz(profile!.focusArea, profile!.mastery, db);
        if (questions && Array.isArray(questions)) {
          setQuizQuestions(questions);
        } else {
          console.error("Failed to generate quiz: Invalid format");
          alert("Failed to generate questions. Please try again.");
          setMode('dashboard');
        }
    } catch (e) {
        console.error("Quiz gen error:", e);
        alert("Failed to generate questions. Please try again.");
        setMode('dashboard');
    }
    
    setIsGenerating(false);
  };

  const submitAnswer = async (index: number) => {
    if (selectedOption !== null) return; 
    
    const endTime = Date.now();
    const timeSpentSeconds = (endTime - questionStartTime.current) / 1000;

    setSelectedOption(index);
    const currentQuestion = quizQuestions[currentQIndex];
    const isCorrect = index === currentQuestion.correctIndex;
    
    if (isCorrect) setSessionScore(prev => prev + 1);
    
    let feedbackText = isCorrect ? "Correct!" : "Incorrect.";
    let masteryChange = 0;
    let isFast = false;
    
    const isMath = profile!.focusArea && (profile!.focusArea.includes("Math") || profile!.focusArea.includes("Algebra") || profile!.focusArea.includes("Geometry"));
    const targetTime = isMath ? 90 : 60;
    
    if (difficultyTier === 'Foundational') {
        // Stage 1 (0-25): Accuracy Focus
        masteryChange = isCorrect ? 4 : -1; 
    } else if (difficultyTier === 'Standard') {
        // Stage 2 (25-75): Fluency Focus
        if (isCorrect) {
            if (timeSpentSeconds <= targetTime) {
                masteryChange = 3; 
                isFast = true;
                feedbackText = `Correct! (${Math.round(timeSpentSeconds)}s)`; 
            } else {
                masteryChange = 1; 
                feedbackText = `Correct, but slow (${Math.round(timeSpentSeconds)}s). Target: ${targetTime}s`;
            }
        } else {
            masteryChange = -2; 
        }
    } else {
        // Stage 3 (75+): Advanced Focus (No time penalty)
        masteryChange = isCorrect ? 2 : -3; 
    }

    setFeedback({ isCorrect, text: feedbackText });

    if (profile) {
      const newMastery = Math.min(100, Math.max(0, profile.mastery + masteryChange));
      
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', profile.id);
      updateDoc(userRef, {
        mastery: newMastery,
        lastActive: serverTimestamp(),
        streak: profile.streak 
      });

      addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'attempts'), {
        userId: user!.uid,
        userName: profile.name,
        question: currentQuestion.question,
        topic: profile.focusArea,
        correct: isCorrect,
        timeSpent: timeSpentSeconds,
        isFast: isFast,
        timestamp: serverTimestamp()
      });
    }
  };

  const nextQuestion = () => {
    if (currentQIndex < quizQuestions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
      setSelectedOption(null);
      setFeedback(null);
      setShowChat(false);
      setChatMessages([]);
    } else {
      finishDrill();
    }
  };

  const finishDrill = async () => {
    if (profile) {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', profile.id);
      await updateDoc(userRef, { streak: profile.streak + 1 });
    }
    setMode('summary');
  };

  const handleSendChat = async (msg = chatInput) => {
    if (!msg.trim()) return;
    
    const newMessage = { role: 'user', text: msg };
    setChatMessages(prev => [...prev, newMessage]);
    setChatInput("");
    setIsChatLoading(true);

    const context = {
      question: quizQuestions[currentQIndex].question,
      options: quizQuestions[currentQIndex].options,
      correctIndex: quizQuestions[currentQIndex].correctIndex,
      selectedOption: selectedOption
    };

    const aiResponseText = await generateTutorResponse(context, msg);
    
    setChatMessages(prev => [...prev, { role: 'ai', text: aiResponseText }]);
    setIsChatLoading(false);
  };

  if (mode === 'loading') return <Spinner />;

  if (mode === 'setup') {
    return (
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow-lg">
        <div className="text-center mb-8">
            <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-2">
                <ScanEye className="text-indigo-600" /> FOCUS PREP
            </h2>
            <p className="text-slate-500 text-sm">Student Portal Login</p>
        </div>
        
        <form onSubmit={(e: any) => {
          e.preventDefault();
          handleCreateProfile(e.target.name.value, e.target.email.value);
        }}>
          <div className="space-y-4">
              <div>
                  <label className="block mb-1 text-sm font-bold text-slate-600">Full Name</label>
                  <div className="relative">
                      <UserIcon className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input name="name" required className="w-full p-3 pl-10 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition" placeholder="e.g. Alex Smith" />
                  </div>
              </div>
              
              <div>
                  <label className="block mb-1 text-sm font-bold text-slate-600">Email Address</label>
                  <div className="relative">
                      <Mail className="absolute left-3 top-3 text-slate-400" size={18} />
                      <input name="email" type="email" required className="w-full p-3 pl-10 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 transition" placeholder="alex@example.com" />
                  </div>
              </div>
          </div>

          <button 
            disabled={isSubmitting}
            className={`w-full mt-8 p-4 rounded-xl font-bold text-white transition flex items-center justify-center gap-2 ${isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg hover:shadow-xl'}`}
          >
            {isSubmitting ? (
                <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/50 border-t-white"></div>
                    Creating Profile...
                </>
            ) : (
                <>
                    Initialize Diagnostics <ArrowRight size={18} />
                </>
            )}
          </button>
        </form>
      </div>
    );
  }

  if (mode === 'diagnostic') {
    return <DiagnosticView onComplete={handleDiagnosticComplete} onSkip={handleSkipDiagnostic} />;
  }

  if (mode === 'report' && reportData) {
    return <DiagnosticReportView reportData={reportData} onConfirm={handleReportConfirm} />;
  }

  const activeQ = quizQuestions[currentQIndex];

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen flex flex-col">
      <header className="bg-white p-4 shadow-sm flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <ScanEye className="text-indigo-600 w-6 h-6" />
          <span className="font-bold text-slate-800 tracking-tight">FOCUS PREP</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onLogout} className="text-slate-400 hover:text-slate-600"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="flex-1 p-4">
        {mode === 'dashboard' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Focus Area</div>
                  <div className="text-lg font-black text-slate-800 leading-tight pr-2">{profile?.focusArea}</div>
                </div>
                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold ${difficultyTier === 'Foundational' ? 'bg-green-100 text-green-700' : difficultyTier === 'Standard' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                  {difficultyTier}
                </div>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden mb-2">
                <div className="bg-indigo-600 h-full" style={{width: `${profile?.mastery}%`}}></div>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>Mastery: {profile?.mastery}%</span>
                <span>Streak: {profile?.streak} 🔥</span>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center gap-2">
                <ClipboardList className="text-slate-400" size={16} />
                <span className="font-bold text-slate-700 text-sm">Priority Growth Areas</span>
              </div>
              <div className="max-h-40 overflow-y-auto">
                {profile?.weaknesses?.slice(0, 3).map((w: string, i: number) => (
                  <div key={i} className="p-3 border-b border-slate-50 last:border-0 flex items-center justify-between">
                    <span className="text-sm text-slate-600 truncate w-3/4">{w}</span>
                    <span className="text-xs font-bold text-red-400">Priority {i+1}</span>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={startDrill} className="w-full bg-slate-900 text-white p-4 rounded-xl shadow-lg active:scale-95 transition flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <div className="bg-indigo-500 p-2 rounded-lg"><Microscope className="text-white w-6 h-6" /></div>
                <div className="text-left"><div className="font-bold text-lg">Daily 5</div><div className="text-slate-400 text-sm">Personalized Session</div></div>
              </div>
              <ChevronRight className="text-slate-500 group-hover:translate-x-1 transition" />
            </button>
          </div>
        )}

        {mode === 'drill' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            {isGenerating ? <Spinner text={`Generating ${difficultyTier} questions...`} /> : activeQ ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  <span>Question {currentQIndex + 1} of {quizQuestions.length}</span>
                  <span>Score: {sessionScore}</span>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-600 h-full transition-all duration-500 ease-out" style={{ width: `${((currentQIndex + 1) / quizQuestions.length) * 100}%` }}></div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <p className="text-lg font-medium text-slate-800 leading-relaxed font-serif">{formatText(activeQ.question)}</p>
                </div>
                <div className="space-y-3">
                  {activeQ.options.map((opt: any, idx: number) => (
                    <button key={idx} disabled={selectedOption !== null} onClick={() => submitAnswer(idx)} className={`w-full p-4 rounded-xl text-left border-2 transition-all ${selectedOption === null ? 'bg-white border-transparent hover:border-slate-200 shadow-sm' : idx === activeQ.correctIndex ? 'bg-green-50 border-green-500 text-green-700' : selectedOption === idx ? 'bg-red-50 border-red-500 text-red-700' : 'bg-slate-50 border-transparent text-slate-400'}`}>
                      <span className="font-bold mr-3 opacity-50">{String.fromCharCode(65 + idx)}</span>
                      {formatText(opt)}
                    </button>
                  ))}
                </div>
                {feedback && (
                  <div className={`p-5 rounded-xl border animate-in fade-in slide-in-from-bottom-2 ${feedback.isCorrect ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {feedback.isCorrect ? <CheckCircle2 className="text-green-600" /> : <XCircle className="text-red-600" />}
                      <span className={`font-bold ${feedback.isCorrect ? 'text-green-800' : 'text-red-800'}`}>{feedback.text}</span>
                    </div>
                    <p className="text-slate-700 text-sm leading-relaxed mb-4">{formatText(activeQ.explanation)}</p>
                    
                    {/* Chat Button */}
                    {!showChat && (
                      <button 
                        onClick={() => setShowChat(true)}
                        className="w-full mb-3 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold border border-indigo-200 hover:bg-indigo-100 flex items-center justify-center gap-2 transition"
                      >
                        <MessageCircle size={18} /> Chat with Tutor
                      </button>
                    )}

                    {/* Chat Interface */}
                    {showChat && (
                      <div className="mt-4 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden animate-in slide-in-from-top-2">
                        <div className="p-3 bg-indigo-100 border-b border-indigo-200 flex justify-between items-center">
                          <span className="text-xs font-bold text-indigo-800 flex items-center gap-1"><ScanEye size={14}/> AI Tutor</span>
                          <button onClick={() => setShowChat(false)}><X size={14} className="text-indigo-400 hover:text-indigo-700" /></button>
                        </div>
                        <div className="h-48 overflow-y-auto p-3 space-y-3 bg-white">
                          {chatMessages.length === 0 && (
                            <div className="text-center text-xs text-slate-400 mt-4">
                              <p className="mb-2">Ask me anything about this question!</p>
                              <button 
                                onClick={() => handleSendChat("Why is my answer wrong?")}
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-full border border-slate-200 transition"
                              >
                                "Why is my answer wrong?"
                              </button>
                            </div>
                          )}
                          {chatMessages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-100 text-slate-700 rounded-bl-none'}`}>
                                {formatText(msg.text)}
                              </div>
                            </div>
                          ))}
                          {isChatLoading && (
                            <div className="flex justify-start">
                              <div className="bg-slate-100 p-3 rounded-xl rounded-bl-none">
                                <div className="flex gap-1">
                                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75"></div>
                                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150"></div>
                                </div>
                              </div>
                            </div>
                          )}
                          <div ref={chatEndRef} />
                        </div>
                        <div className="p-2 bg-white border-t border-slate-200 flex gap-2">
                          <input 
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                            placeholder="Type your question..."
                            className="flex-1 text-sm p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                          />
                          <button 
                            onClick={() => handleSendChat()}
                            disabled={isChatLoading || !chatInput.trim()}
                            className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Send size={16} />
                          </button>
                        </div>
                      </div>
                    )}

                    <button onClick={nextQuestion} className="w-full mt-4 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2">
                      {currentQIndex < quizQuestions.length - 1 ? "Next Question" : "View Report"} <ArrowRight size={18} />
                    </button>
                  </div>
                )}
              </div>
            ) : <div className="text-center p-10 text-red-500">Generation Error. Try refreshing.</div>}
          </div>
        )}

        {mode === 'summary' && (
          <div className="text-center py-10 space-y-6 animate-in zoom-in-95 duration-500">
            <div className="inline-block p-4 bg-yellow-100 rounded-full mb-2"><Trophy className="w-12 h-12 text-yellow-600" /></div>
            <h2 className="text-3xl font-black text-slate-800">Session Complete</h2>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
              <div className="text-slate-400 text-sm uppercase tracking-wider mb-2">Accuracy</div>
              <div className="text-6xl font-black text-slate-900 mb-4">{Math.round((sessionScore / quizQuestions.length) * 100)}%</div>
              <p className="text-slate-600">You answered {sessionScore} out of {quizQuestions.length} correctly.</p>
            </div>
            <button onClick={() => setMode('dashboard')} className="w-full bg-indigo-600 text-white p-4 rounded-xl shadow-lg hover:bg-indigo-700 transition font-bold">Return to Dashboard</button>
          </div>
        )}
      </main>
    </div>
  );
};

// --- View 2: Counselor Interface (Kept same as before but abbreviated for brevity if unchanged) ---
const CounselorView = ({ onLogout }: { onLogout: () => void }) => {
  const [students, setStudents] = useState<any[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'artifacts', appId, 'public', 'data', 'users'), where('role', '==', 'student'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedStudents.sort((a, b) => (b.lastActive?.toDate() || 0) - (a.lastActive?.toDate() || 0));
      setStudents(fetchedStudents);
    });
    return () => unsubscribe();
  }, []);

  const getStatusColor = (lastActive: any, mastery: number) => {
    if (mastery < 40) return 'bg-red-100 text-red-700 border-red-200';
    if (!lastActive) return 'bg-slate-100 text-slate-500';
    const daysAgo = (new Date().getTime() - lastActive.toDate().getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo > 3) return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    return 'bg-green-100 text-green-700 border-green-200';
  };

  return (
    <div className="min-h-screen bg-slate-50">
       <div className="bg-slate-900 text-white p-6 pb-20">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><ScanEye className="text-indigo-400" /> FOCUS PREP</h1>
            <p className="text-slate-400 text-sm mt-1">Instructor Dashboard</p>
          </div>
          <button onClick={onLogout} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm transition">Log Out</button>
        </div>
      </div>
      <div className="max-w-4xl mx-auto -mt-10 px-4">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
           <div className="p-6 border-b border-slate-100 flex justify-between items-center">
             <h2 className="font-bold text-lg text-slate-800">Active Students ({students.length})</h2>
           </div>
           <div className="divide-y divide-slate-100">
             {students.map(student => (
               <div key={student.id} className="p-4 hover:bg-slate-50 transition flex items-center justify-between">
                 <div className="flex items-center gap-4">
                   <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${getStatusColor(student.lastActive, student.mastery)}`}>{student.mastery}%</div>
                   <div><div className="font-bold text-slate-800">{student.name}</div><div className="text-xs text-slate-500">Focus: {student.focusArea}</div></div>
                 </div>
                 <button className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg transition"><AlertCircle size={20} /></button>
               </div>
             ))}
           </div>
        </div>
      </div>
    </div>
  );
};

// --- Main App Entry ---
const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); });
  }, []);

  if (loading) return <Spinner />;

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center space-y-2">
            <ScanEye className="w-16 h-16 text-indigo-500 mx-auto" />
            <h1 className="text-3xl font-black text-white tracking-tight">FOCUS PREP</h1>
            <p className="text-slate-400">Precision Learning Engine</p>
          </div>
          <div className="grid gap-4">
            <button onClick={() => setRole('student')} className="group relative flex items-center p-6 bg-slate-800 rounded-2xl hover:bg-slate-700 transition border border-slate-700 hover:border-indigo-500">
              <div className="bg-indigo-500/10 p-3 rounded-xl group-hover:bg-indigo-500/20 transition"><GraduationCap className="w-6 h-6 text-indigo-400" /></div>
              <div className="ml-4 text-left"><div className="text-white font-bold text-lg">I am a Student</div></div>
            </button>
            <button onClick={() => setRole('counselor')} className="group relative flex items-center p-6 bg-slate-800 rounded-2xl hover:bg-slate-700 transition border border-slate-700 hover:border-emerald-500">
              <div className="bg-emerald-500/10 p-3 rounded-xl group-hover:bg-emerald-500/20 transition"><BarChart3 className="w-6 h-6 text-emerald-400" /></div>
              <div className="ml-4 text-left"><div className="text-white font-bold text-lg">I am a Counselor</div></div>
            </button>
             <button onClick={() => setRole('teacher')} className="group relative flex items-center p-6 bg-slate-800 rounded-2xl hover:bg-slate-700 transition border border-slate-700 hover:border-purple-500">
              <div className="bg-purple-500/10 p-3 rounded-xl group-hover:bg-purple-500/20 transition"><BrainCircuit className="w-6 h-6 text-purple-400" /></div>
              <div className="ml-4 text-left"><div className="text-white font-bold text-lg">I am the Architect</div><div className="text-slate-400 text-sm">Configure AI Logic</div></div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return role === 'student' ? <StudentView user={user} onLogout={() => setRole(null)} /> 
       : role === 'counselor' ? <CounselorView onLogout={() => setRole(null)} />
       : <TeacherView onLogout={() => setRole(null)} />;
};

export default App;