import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { EditorView, lineNumbers, gutter, GutterMarker } from '@codemirror/view';
import { StateField, StateEffect, RangeSet } from '@codemirror/state';
import { useAuth, IdeFile } from '../../context/AuthContext.tsx';
import {
  IDE_THEMES,
  ThemeId,
  EditorSettings,
  DEFAULT_EDITOR_SETTINGS,
} from '../../ide/ideThemes.ts';
import {
  DebugStep,
  DebuggerMode,
  CallStackFrame,
  VariableItem,
} from '../../ide/debuggerTypes.ts';
import {
  Play,
  Bug,
  StepForward,
  ArrowDown,
  ArrowUp,
  Square,
  RotateCcw,
  Plus,
  Trash2,
  Edit2,
  Download,
  Upload,
  Copy,
  Check,
  Settings,
  Terminal,
  Layers,
  Variable,
  Clock,
  Sparkles,
  FileCode,
  AlertCircle,
  Pause,
  ChevronRight,
  Maximize2,
  Minimize2,
  FolderOpen,
  Code2,
} from 'lucide-react';

const CODE_TEMPLATES: Record<string, { name: string; code: string }> = {
  'binary_search': {
    name: 'Tìm kiếm nhị phân',
    code: `def binary_search(arr, target):
    left = 0
    right = len(arr) - 1
    
    while left <= right:
        mid = (left + right) // 2
        print(f"Xét phạm vi [{left}, {right}], mid={mid}, val={arr[mid]}")
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
            
    return -1

mang = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
target = 23
ket_qua = binary_search(mang, target)
print(f"Tìm thấy {target} tại vị trí: {ket_qua}")
`,
  },
  'two_pointers': {
    name: 'Hai con trỏ (Two Pointers)',
    code: `def two_sum_sorted(arr, target):
    left = 0
    right = len(arr) - 1
    
    while left < right:
        tong = arr[left] + arr[right]
        if tong == target:
            return (left, right)
        elif tong < target:
            left += 1
        else:
            right -= 1
    return None

arr = [1, 3, 4, 6, 8, 11, 15]
target = 14
ans = two_sum_sorted(arr, target)
print(f"Cặp chỉ số có tổng bằng {target}: {ans}")
`,
  },
  'fibonacci': {
    name: 'Dãy Fibonacci & Đệ quy',
    code: `def fib(n):
    if n <= 1:
        return n
    return fib(n - 1) + fib(n - 2)

n = 5
ans = fib(n)
print(f"Fibonacci({n}) = {ans}")
`,
  },
  'bubble_sort': {
    name: 'Sắp xếp nổi bọt (Bubble Sort)',
    code: `def bubble_sort(arr):
    n = len(arr)
    for i in range(n):
        for j in range(0, n - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr

danh_sach = [64, 34, 25, 12, 22, 11, 90]
ket_qua = bubble_sort(danh_sach)
print("Mảng sau khi sắp xếp:", ket_qua)
`,
  },
};

export const IdePage: React.FC = () => {
  const { user, userFiles, setUserFiles, saveFilesToCloud, awardXp } = useAuth();
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  // Files & Tabs
  const [files, setFiles] = useState<IdeFile[]>(() => {
    if (userFiles && userFiles.length > 0) return userFiles;
    return [
      {
        id: 'f-main',
        name: 'main.py',
        content: `# Chào mừng bạn đến với Professional Python IDE!
# Hỗ trợ Execution Tracing, Breakpoints, Variables Inspector & Call Stack.

def tinh_tong_chu_so(n):
    tong = 0
    while n > 0:
        cs = n % 10
        tong += cs
        n //= 10
    return tong

def kiem_tra_so_dep(x):
    s = tinh_tong_chu_so(x)
    return s % 9 == 0

danh_sach = [18, 27, 34, 99, 108]
ket_qua = []

for num in danh_sach:
    if kiem_tra_so_dep(num):
        ket_qua.append(num)

print("Các số đẹp tìm thấy:", ket_qua)
`,
        updatedAt: new Date().toISOString(),
      },
    ];
  });

  const [activeFileId, setActiveFileId] = useState<string>(files[0]?.id || 'f-main');
  const [openTabIds, setOpenTabIds] = useState<string[]>([files[0]?.id || 'f-main']);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');

  // Editor Settings
  const [settings, setSettings] = useState<EditorSettings>(() => {
    const saved = localStorage.getItem('codetrekking_ide_settings');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }
    return DEFAULT_EDITOR_SETTINGS;
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Debugger & Tracing State
  const [breakpoints, setBreakpoints] = useState<number[]>([18]);
  const [debuggerMode, setDebuggerMode] = useState<DebuggerMode>('idle');
  const [debugSteps, setDebugSteps] = useState<DebugStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedStackFrameIndex, setSelectedStackFrameIndex] = useState<number | null>(null);

  // Terminal & Output
  const [terminalOutput, setTerminalOutput] = useState<string>('');
  const [stdinInput, setStdinInput] = useState<string>('');
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<'terminal' | 'variables' | 'callstack' | 'timeline'>('terminal');

  // Copy feedback
  const [isCopied, setIsCopied] = useState(false);

  // Active File
  const activeFile = files.find((f) => f.id === activeFileId) || files[0];

  // Sync user files from auth context if updated
  useEffect(() => {
    if (userFiles && userFiles.length > 0 && files.length <= 1) {
      setFiles(userFiles);
      if (!files.some((f) => f.id === activeFileId)) {
        setActiveFileId(userFiles[0].id);
        setOpenTabIds([userFiles[0].id]);
      }
    }
  }, [userFiles]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('codetrekking_ide_settings', JSON.stringify(settings));
  }, [settings]);

  // Code modification handler
  const handleCodeChange = (newCode: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === activeFileId ? { ...f, content: newCode, updatedAt: new Date().toISOString() } : f))
    );
    setSaveStatus('dirty');
  };

  // Auto-save debouncer
  useEffect(() => {
    if (saveStatus !== 'dirty') return;
    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      await saveFilesToCloud(files);
      setUserFiles(files);
      setSaveStatus('saved');
    }, 1200);

    return () => clearTimeout(timer);
  }, [files, saveStatus, saveFilesToCloud, setUserFiles]);

  // Toggle Breakpoint on line click
  const toggleBreakpoint = (lineNo: number) => {
    setBreakpoints((prev) =>
      prev.includes(lineNo) ? prev.filter((l) => l !== lineNo) : [...prev, lineNo].sort((a, b) => a - b)
    );
  };

  // ================= RUN WITHOUT DEBUGGER =================
  const handleRun = async () => {
    if (!activeFile) return;
    setDebuggerMode('running');
    setActiveBottomTab('terminal');
    setTerminalOutput('Đang biên dịch và chạy chương trình trong Python Sandbox...\n');
    setErrorMessage(null);

    const startTime = Date.now();
    try {
      const res = await fetch('/api/python/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: activeFile.content,
          input: stdinInput,
          timeLimitSec: 4,
        }),
      });

      const data = await res.json();
      const elapsed = data.elapsedMs || Date.now() - startTime;
      setExecutionTime(elapsed);

      if (data.status === 'timeout') {
        setTerminalOutput((prev) => prev + `\n❌ [TIMEOUT]: Quá thời gian thực thi (4s).\n`);
        setErrorMessage('Timeout Error: Vòng lặp vô hạn hoặc tính toán quá lâu.');
        setDebuggerMode('error');
      } else if (data.status === 'ok') {
        setTerminalOutput(data.stdout || '[Chương trình kết thúc không có đầu ra]');
        setDebuggerMode('finished');
        // Award XP for successful run
        if (user) {
          awardXp('ide_run_debug', activeFile.id);
        }
      } else {
        setTerminalOutput(data.stdout || '');
        setErrorMessage(data.error || 'Runtime Error');
        setDebuggerMode('error');
      }
    } catch (err: any) {
      setTerminalOutput(`❌ Lỗi kết nối máy chủ: ${err?.message}`);
      setDebuggerMode('error');
    }
  };

  // ================= START FULL DEBUGGER (sys.settrace) =================
  const handleStartDebug = async () => {
    if (!activeFile) return;
    setDebuggerMode('running');
    setActiveBottomTab('variables');
    setTerminalOutput('Khởi động Python Debugger (sys.settrace)...\n');
    setErrorMessage(null);
    setIsPlaying(false);

    try {
      const res = await fetch('/api/python/debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: activeFile.content,
          input: stdinInput,
          maxSteps: 1500,
        }),
      });

      const data = await res.json();
      setExecutionTime(data.elapsedMs || 0);

      if (!data.success && data.status === 'timeout') {
        setErrorMessage('Debugger Timeout: Quá thời gian theo dõi.');
        setDebuggerMode('error');
        return;
      }

      if (data.steps && data.steps.length > 0) {
        setDebugSteps(data.steps);
        setCurrentStepIndex(0);
        setDebuggerMode('paused');
        setTerminalOutput(data.steps[0].stdout || '');

        if (data.runtimeError) {
          setErrorMessage(data.runtimeError);
        }

        // Award XP for successful debug trace
        if (user) {
          awardXp('ide_debug_session', activeFile.id);
        }
      } else {
        setTerminalOutput(data.finalOutput || '');
        if (data.runtimeError) {
          setErrorMessage(data.runtimeError);
        }
        setDebuggerMode('finished');
      }
    } catch (err: any) {
      setErrorMessage(`Lỗi debugger: ${err?.message}`);
      setDebuggerMode('error');
    }
  };

  // Current Step Data
  const currentStep: DebugStep | undefined = debugSteps[currentStepIndex];

  // Active executing line number
  const activeLine = debuggerMode === 'paused' || debuggerMode === 'running' ? currentStep?.line : undefined;

  // Jump to step
  const goToStep = (stepIdx: number) => {
    if (stepIdx < 0 || stepIdx >= debugSteps.length) return;
    setCurrentStepIndex(stepIdx);
    setSelectedStackFrameIndex(null);
    const step = debugSteps[stepIdx];
    if (step) {
      setTerminalOutput(step.stdout || '');
    }
  };

  // Debugger Controls:
  // 1. Step Into: Move to immediate next step
  const handleStepInto = () => {
    if (currentStepIndex < debugSteps.length - 1) {
      goToStep(currentStepIndex + 1);
    } else {
      setDebuggerMode('finished');
    }
  };

  // 2. Step Over: Advance until next line with same or shallower call stack depth
  const handleStepOver = () => {
    if (!currentStep) return;
    const currentDepth = currentStep.callStack.length;
    let nextIdx = currentStepIndex + 1;

    while (nextIdx < debugSteps.length) {
      const step = debugSteps[nextIdx];
      if (step.callStack.length <= currentDepth && step.event === 'line') {
        goToStep(nextIdx);
        return;
      }
      nextIdx++;
    }
    // If end reached
    goToStep(debugSteps.length - 1);
    setDebuggerMode('finished');
  };

  // 3. Step Out: Advance until returning from current function
  const handleStepOut = () => {
    if (!currentStep) return;
    const currentDepth = currentStep.callStack.length;
    let nextIdx = currentStepIndex + 1;

    while (nextIdx < debugSteps.length) {
      const step = debugSteps[nextIdx];
      if (step.callStack.length < currentDepth) {
        goToStep(nextIdx);
        return;
      }
      nextIdx++;
    }
    goToStep(debugSteps.length - 1);
    setDebuggerMode('finished');
  };

  // 4. Continue: Run to next breakpoint
  const handleContinue = () => {
    let nextIdx = currentStepIndex + 1;
    while (nextIdx < debugSteps.length) {
      const step = debugSteps[nextIdx];
      if (breakpoints.includes(step.line)) {
        goToStep(nextIdx);
        return;
      }
      nextIdx++;
    }
    // No more breakpoints, go to end
    goToStep(debugSteps.length - 1);
    setDebuggerMode('finished');
  };

  // 5. Pause / Autoplay Replay
  useEffect(() => {
    if (!isPlaying || debuggerMode !== 'paused') return;

    const delay = Math.max(100, Math.round(600 / playbackSpeed));
    const timer = setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev < debugSteps.length - 1) {
          const next = prev + 1;
          const step = debugSteps[next];
          if (step) setTerminalOutput(step.stdout || '');
          return next;
        } else {
          setIsPlaying(false);
          setDebuggerMode('finished');
          return prev;
        }
      });
    }, delay);

    return () => clearInterval(timer);
  }, [isPlaying, debuggerMode, debugSteps, playbackSpeed]);

  // 6. Stop
  const handleStop = () => {
    setDebuggerMode('idle');
    setIsPlaying(false);
    setDebugSteps([]);
    setCurrentStepIndex(0);
    setErrorMessage(null);
  };

  // Inspect Variables:
  // If user selected a specific callstack frame, show variables for that frame
  const visibleLocals = currentStep?.locals || {};
  const visibleGlobals = currentStep?.globals || {};
  const visibleChanges = currentStep?.changedVars || {};

  // Group variables by categories
  const categorizedVars = useMemo(() => {
    const list: VariableItem[] = Object.values(visibleLocals);
    const groups: Record<string, VariableItem[]> = {
      'Số (Numbers)': [],
      'Chuỗi (Strings)': [],
      'Mảng & Danh sách (Lists)': [],
      'Từ điển (Dictionaries)': [],
      'Tập hợp & Boolean': [],
      'Khác': [],
    };

    for (const v of list) {
      if (v.category === 'number') groups['Số (Numbers)'].push(v);
      else if (v.category === 'string') groups['Chuỗi (Strings)'].push(v);
      else if (v.category === 'list') groups['Mảng & Danh sách (Lists)'].push(v);
      else if (v.category === 'dict') groups['Từ điển (Dictionaries)'].push(v);
      else if (v.category === 'boolean' || v.category === 'set') groups['Tập hợp & Boolean'].push(v);
      else groups['Khác'].push(v);
    }
    return groups;
  }, [visibleLocals]);

  // File Operations:
  const handleCreateFile = () => {
    const fileName = prompt('Nhập tên file mới (vd: bai_tap.py):', `code_${files.length + 1}.py`);
    if (!fileName || !fileName.trim()) return;
    const finalName = fileName.endsWith('.py') ? fileName.trim() : `${fileName.trim()}.py`;

    const newFile: IdeFile = {
      id: `f-${Date.now()}`,
      name: finalName,
      content: `# File ${finalName}\nprint("Xin chào từ ${finalName}")\n`,
      updatedAt: new Date().toISOString(),
    };

    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setOpenTabIds((prev) => [...prev, newFile.id]);
    setSaveStatus('dirty');
  };

  const handleDeleteFile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (files.length <= 1) {
      alert('Không thể xóa file cuối cùng');
      return;
    }
    if (confirm('Bạn có chắc chắn muốn xóa file này không?')) {
      const remaining = files.filter((f) => f.id !== id);
      setFiles(remaining);
      setOpenTabIds((prev) => prev.filter((tabId) => tabId !== id));
      if (activeFileId === id) {
        setActiveFileId(remaining[0].id);
      }
      setSaveStatus('dirty');
    }
  };

  const handleDownloadFile = () => {
    if (!activeFile) return;
    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const newFile: IdeFile = {
        id: `f-${Date.now()}`,
        name: file.name,
        content: content || '',
        updatedAt: new Date().toISOString(),
      };
      setFiles((prev) => [...prev, newFile]);
      setActiveFileId(newFile.id);
      setOpenTabIds((prev) => [...prev, newFile.id]);
      setSaveStatus('dirty');
    };
    reader.readAsText(file);
  };

  const handleCopyCode = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 1500);
  };

  const handleLoadTemplate = (tplKey: string) => {
    const tpl = CODE_TEMPLATES[tplKey];
    if (!tpl) return;
    if (confirm(`Nạp mẫu thuật toán "${tpl.name}" vào file hiện tại?`)) {
      handleCodeChange(tpl.code);
    }
  };

  // Editor Extensions & Styling
  const selectedTheme = IDE_THEMES[settings.theme] || IDE_THEMES['vscode-dark'];

  // CodeMirror Extensions with gutter breakpoint & line highlight
  const extensions = useMemo(() => {
    return [
      python(),
      selectedTheme.themeExtension,
      EditorView.lineWrapping,
      EditorView.theme({
        '&': {
          fontSize: `${settings.fontSize}px`,
          fontFamily: settings.fontFamily,
          lineHeight: settings.lineHeight.toString(),
        },
        '.cm-scroller': { overflow: 'auto' },
        '.cm-gutters': {
          backgroundColor: selectedTheme.isDark ? '#0b0f17' : '#f8fafc',
          borderRight: `1px solid ${selectedTheme.isDark ? '#1e293b' : '#e2e8f0'}`,
        },
        '.cm-activeLine': {
          backgroundColor: selectedTheme.isDark ? 'rgba(59, 130, 246, 0.08)' : 'rgba(59, 130, 246, 0.05)',
        },
      }),
    ];
  }, [selectedTheme, settings]);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* 1. TOP MAIN TOOLBAR */}
      <div className="h-12 border-b border-slate-800 bg-slate-900/90 px-3 flex items-center justify-between gap-2 shrink-0">
        {/* Left: Execution Controls */}
        <div className="flex items-center gap-1.5">
          {/* Run Button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={debuggerMode === 'running'}
            title="Chạy toàn bộ chương trình (Run)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span className="hidden sm:inline">Chạy</span>
          </button>

          {/* Debug Button */}
          <button
            type="button"
            onClick={handleStartDebug}
            disabled={debuggerMode === 'running'}
            title="Khởi động gỡ lỗi từng bước (Debug sys.settrace)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
          >
            <Bug className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Debug</span>
          </button>

          {/* Debugger Step Controls (Only active during debug) */}
          <div className="h-5 w-px bg-slate-800 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={handleStepOver}
            disabled={debuggerMode !== 'paused'}
            title="Bước qua (Step Over - F10)"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <StepForward className="w-4 h-4 text-cyan-400" />
          </button>

          <button
            type="button"
            onClick={handleStepInto}
            disabled={debuggerMode !== 'paused'}
            title="Bước vào hàm (Step Into - F11)"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ArrowDown className="w-4 h-4 text-emerald-400" />
          </button>

          <button
            type="button"
            onClick={handleStepOut}
            disabled={debuggerMode !== 'paused'}
            title="Thoát khỏi hàm (Step Out - Shift+F11)"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <ArrowUp className="w-4 h-4 text-amber-400" />
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={debuggerMode !== 'paused'}
            title="Tiếp tục đến breakpoint tiếp theo (Continue - F5)"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Play className="w-4 h-4 text-blue-400" />
          </button>

          {debuggerMode !== 'idle' && (
            <button
              type="button"
              onClick={handleStop}
              title="Dừng chương trình (Stop)"
              className="p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 transition-colors cursor-pointer"
            >
              <Square className="w-4 h-4 fill-rose-400" />
            </button>
          )}

          {/* Status Badge */}
          {debuggerMode === 'paused' && currentStep && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
              <span>Dòng {currentStep.line}</span>
              <span className="text-slate-600">|</span>
              <span>Hàm: {currentStep.func}()</span>
              <span className="text-slate-600">|</span>
              <span>Bước {currentStepIndex + 1}/{debugSteps.length}</span>
            </div>
          )}
        </div>

        {/* Center: Save state info */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>
            {saveStatus === 'saving'
              ? 'Đang lưu...'
              : user
              ? 'Đã đồng bộ đám mây'
              : 'Đã lưu cục bộ'}
          </span>
        </div>

        {/* Right: Actions & Settings */}
        <div className="flex items-center gap-1.5">
          {/* Templates Selector */}
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Mẫu thuật toán</span>
            </button>
            <div className="absolute right-0 top-full mt-1 w-56 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-1.5 space-y-1 hidden group-hover:block z-50">
              {Object.entries(CODE_TEMPLATES).map(([key, tpl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleLoadTemplate(key)}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
                >
                  {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Copy Code */}
          <button
            type="button"
            onClick={handleCopyCode}
            title="Sao chép code"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          {/* Download File */}
          <button
            type="button"
            onClick={handleDownloadFile}
            title="Tải về file .py"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-400" />
          </button>

          {/* Upload File */}
          <label
            title="Tải lên file Python"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer flex items-center justify-center"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            <input type="file" accept=".py" onChange={handleUploadFile} className="hidden" />
          </label>

          {/* Settings Modal */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            title="Cài đặt Theme & Font"
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 2. BODY SPLIT: SIDEBAR + EDITOR + DEBUG PANELS */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: File Tree */}
        <div className="w-56 border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0 hidden md:flex">
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>TỆP PYTHON</span>
            </span>
            <button
              type="button"
              onClick={handleCreateFile}
              title="Tạo file mới"
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {files.map((file) => {
              const isActive = file.id === activeFileId;
              return (
                <div
                  key={file.id}
                  onClick={() => {
                    setActiveFileId(file.id);
                    if (!openTabIds.includes(file.id)) {
                      setOpenTabIds((prev) => [...prev, file.id]);
                    }
                  }}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-mono transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileCode className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span className="truncate">{file.name}</span>
                  </div>

                  {files.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteFile(file.id, e)}
                      title="Xóa file"
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-slate-500 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Breakpoints Inspector list */}
          <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
              ĐIỂM DỪNG (BREAKPOINTS)
            </span>
            {breakpoints.length === 0 ? (
              <p className="text-[11px] text-slate-500">Chưa đặt điểm dừng nào. Nhấn vào lề số dòng để đặt.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {breakpoints.map((lineNo) => (
                  <span
                    key={lineNo}
                    onClick={() => toggleBreakpoint(lineNo)}
                    title="Nhấn để gỡ điểm dừng"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-mono cursor-pointer hover:bg-rose-500/30"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    <span>Dòng {lineNo}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Tabs + Code Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
          {/* Tab Bar */}
          <div className="h-9 border-b border-slate-800 bg-slate-950 flex items-center px-2 gap-1 overflow-x-auto shrink-0">
            {openTabIds.map((tabId) => {
              const tabFile = files.find((f) => f.id === tabId);
              if (!tabFile) return null;
              const isActive = tabId === activeFileId;

              return (
                <div
                  key={tabId}
                  onClick={() => setActiveFileId(tabId)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-t-xl text-xs font-mono border-t border-x cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-slate-100 border-slate-700'
                      : 'bg-slate-950 text-slate-500 hover:text-slate-300 border-transparent'
                  }`}
                >
                  <FileCode className={`w-3.5 h-3.5 ${isActive ? 'text-blue-400' : 'text-slate-600'}`} />
                  <span>{tabFile.name}</span>
                  {openTabIds.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenTabIds((prev) => prev.filter((id) => id !== tabId));
                        if (activeFileId === tabId) {
                          const remaining = openTabIds.filter((id) => id !== tabId);
                          setActiveFileId(remaining[0]);
                        }
                      }}
                      className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-white"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* CodeMirror Area */}
          <div className="relative flex-1 overflow-hidden flex flex-col">
            {/* Active Executing Line indicator banner */}
            {activeLine !== undefined && (
              <div className="px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs font-mono flex items-center justify-between shrink-0 animate-pulse">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>Đang thực thi dòng <strong>{activeLine}</strong> (Bước {currentStepIndex + 1}/{debugSteps.length})</span>
                </span>
                <span className="text-[11px] text-amber-400/80">Nhấn F10 (Step Over) hoặc F11 (Step Into) để tiếp tục</span>
              </div>
            )}

            <div className="flex-1 overflow-auto">
              <CodeMirror
                ref={editorRef}
                value={activeFile?.content || ''}
                height="100%"
                theme={selectedTheme.themeExtension}
                extensions={extensions}
                onChange={handleCodeChange}
                basicSetup={{
                  lineNumbers: true,
                  highlightActiveLineGutter: true,
                  highlightSpecialChars: true,
                  history: true,
                  foldGutter: true,
                  drawSelection: true,
                  dropCursor: true,
                  allowMultipleSelections: true,
                  indentOnInput: true,
                  syntaxHighlighting: true,
                  bracketMatching: true,
                  closeBrackets: true,
                  autocompletion: true,
                  rectangularSelection: true,
                  crosshairCursor: true,
                  highlightActiveLine: true,
                  highlightSelectionMatches: true,
                  closeBracketsKeymap: true,
                  defaultKeymap: true,
                  searchKeymap: true,
                  historyKeymap: true,
                  foldKeymap: true,
                  completionKeymap: true,
                  lintKeymap: true,
                }}
              />
            </div>
          </div>

          {/* 3. BOTTOM PANEL: TERMINAL / VARIABLES / CALL STACK / TIMELINE */}
          <div className="h-64 sm:h-72 border-t border-slate-800 bg-slate-900/95 flex flex-col shrink-0">
            {/* Panel Header Tabs */}
            <div className="h-10 border-b border-slate-800 bg-slate-950 px-3 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveBottomTab('terminal')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeBottomTab === 'terminal'
                      ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Terminal</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveBottomTab('variables')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeBottomTab === 'variables'
                      ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Variable className="w-3.5 h-3.5" />
                  <span>Biến (Variables)</span>
                  {Object.keys(visibleLocals).length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px]">
                      {Object.keys(visibleLocals).length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveBottomTab('callstack')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeBottomTab === 'callstack'
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Call Stack</span>
                  {currentStep && (
                    <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-400 text-[10px]">
                      {currentStep.callStack.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveBottomTab('timeline')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    activeBottomTab === 'timeline'
                      ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Dòng thời gian (Timeline)</span>
                  {debugSteps.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-400 text-[10px]">
                      {debugSteps.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Execution time indicator */}
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                {executionTime !== null && (
                  <span className="hidden sm:inline">⏱️ {executionTime}ms</span>
                )}
                {activeBottomTab === 'terminal' && (
                  <button
                    type="button"
                    onClick={() => setTerminalOutput('')}
                    className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded"
                    title="Xóa terminal"
                  >
                    Xóa
                  </button>
                )}
              </div>
            </div>

            {/* Panel Body Content */}
            <div className="flex-1 overflow-auto p-3">
              {/* TAB 1: TERMINAL */}
              {activeBottomTab === 'terminal' && (
                <div className="h-full flex flex-col font-mono text-xs">
                  <div className="flex-1 overflow-y-auto whitespace-pre-wrap text-slate-200 select-text">
                    {terminalOutput || <span className="text-slate-600">Nhấn "Chạy" hoặc "Debug" để thực thi mã...</span>}
                    {errorMessage && (
                      <div className="mt-2 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
                        ❌ {errorMessage}
                      </div>
                    )}
                  </div>

                  {/* Standard Input simulation box */}
                  <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-2">
                    <span className="text-slate-500 text-[11px] shrink-0">Dữ liệu input():</span>
                    <input
                      type="text"
                      placeholder="Nhập dữ liệu nếu code sử dụng input()..."
                      value={stdinInput}
                      onChange={(e) => setStdinInput(e.target.value)}
                      className="flex-1 px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: VARIABLES INSPECTOR */}
              {activeBottomTab === 'variables' && (
                <div className="h-full overflow-y-auto space-y-4">
                  {Object.keys(visibleLocals).length === 0 && Object.keys(visibleGlobals).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Chưa có biến nào tại bước này. Bắt đầu phiên "Debug" để theo dõi biến theo từng dòng.
                    </div>
                  ) : (
                    <div>
                      {/* Local Variables Table */}
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-[10px] text-slate-400 uppercase font-bold">
                            <th className="py-1.5 px-3">Tên biến</th>
                            <th className="py-1.5 px-3">Kiểu dữ liệu</th>
                            <th className="py-1.5 px-3">Giá trị hiện tại</th>
                            <th className="py-1.5 px-3 text-right">Biến động</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {Object.entries(visibleLocals).map(([name, item]) => {
                            const change = visibleChanges[name];
                            return (
                              <tr
                                key={name}
                                className={`transition-colors ${
                                  change ? 'bg-amber-500/15 text-amber-200 font-bold' : 'hover:bg-slate-800/40 text-slate-300'
                                }`}
                              >
                                <td className="py-1.5 px-3 text-cyan-400">{name}</td>
                                <td className="py-1.5 px-3 text-slate-500">{item.type}</td>
                                <td className="py-1.5 px-3 text-slate-100 font-bold">{item.value}</td>
                                <td className="py-1.5 px-3 text-right text-[11px]">
                                  {change ? (
                                    <span className="text-amber-400">
                                      {change.before !== null ? `${change.before} → ` : 'mới: '}
                                      {change.after}
                                    </span>
                                  ) : (
                                    <span className="text-slate-600">-</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CALL STACK */}
              {activeBottomTab === 'callstack' && (
                <div className="h-full overflow-y-auto">
                  {!currentStep || currentStep.callStack.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Chưa có frame nào trong Call Stack. Chạy ở chế độ Debug để theo dõi.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {currentStep.callStack.map((frame, idx) => {
                        const isTop = idx === currentStep.callStack.length - 1;
                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedStackFrameIndex(idx)}
                            className={`flex items-center justify-between p-2 rounded-xl text-xs font-mono transition-colors cursor-pointer ${
                              isTop
                                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 font-bold'
                                : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">#{idx + 1}</span>
                              <span className="text-indigo-400">{frame.func}()</span>
                              <span className="text-slate-600">•</span>
                              <span className="text-slate-400">{frame.file}:{frame.line}</span>
                            </div>
                            {isTop && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400">
                                Đang thực thi
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: EXECUTION TIMELINE */}
              {activeBottomTab === 'timeline' && (
                <div className="h-full flex flex-col space-y-3">
                  {debugSteps.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      Chưa có dữ liệu dòng thời gian. Nhấn "Debug" để ghi lại từng bước chạy.
                    </div>
                  ) : (
                    <>
                      {/* Scrub bar & Controls */}
                      <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-2xl border border-slate-800 shrink-0">
                        {/* Play/Pause */}
                        <button
                          type="button"
                          onClick={() => setIsPlaying(!isPlaying)}
                          className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-500 cursor-pointer"
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>

                        {/* Slider Scrubber */}
                        <div className="flex-1 flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={debugSteps.length - 1}
                            value={currentStepIndex}
                            onChange={(e) => goToStep(Number(e.target.value))}
                            className="w-full accent-blue-500 cursor-pointer"
                          />
                          <span className="text-xs font-mono text-slate-400 shrink-0">
                            {currentStepIndex + 1}/{debugSteps.length}
                          </span>
                        </div>

                        {/* Speed Selector */}
                        <div className="flex items-center gap-1 text-xs">
                          <span className="text-slate-500">Tốc độ:</span>
                          {[0.5, 1, 2, 5].map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => setPlaybackSpeed(spd)}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                playbackSpeed === spd
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-800 text-slate-400 hover:text-white'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Step Log Table */}
                      <div className="flex-1 overflow-y-auto">
                        <table className="w-full text-left text-xs font-mono border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-[10px] text-slate-500 uppercase">
                              <th className="py-1 px-2">Bước</th>
                              <th className="py-1 px-2">Dòng</th>
                              <th className="py-1 px-2">Sự kiện</th>
                              <th className="py-1 px-2">Hàm</th>
                              <th className="py-1 px-2">Biến thay đổi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {debugSteps.map((step, idx) => {
                              const isCurrent = idx === currentStepIndex;
                              const changeNames = Object.keys(step.changedVars);

                              return (
                                <tr
                                  key={idx}
                                  onClick={() => goToStep(idx)}
                                  className={`cursor-pointer transition-colors ${
                                    isCurrent
                                      ? 'bg-purple-600/20 text-purple-300 font-bold'
                                      : 'hover:bg-slate-800/40 text-slate-400'
                                  }`}
                                >
                                  <td className="py-1 px-2 font-bold">{idx + 1}</td>
                                  <td className="py-1 px-2 text-cyan-400">Dòng {step.line}</td>
                                  <td className="py-1 px-2 text-slate-500">{step.event}</td>
                                  <td className="py-1 px-2 text-indigo-400">{step.func}()</td>
                                  <td className="py-1 px-2 text-amber-300">
                                    {changeNames.length > 0 ? (
                                      changeNames.map((n) => `${n}: ${step.changedVars[n].after}`).join(', ')
                                    ) : (
                                      <span className="text-slate-600">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. SETTINGS MODAL */}
      {isSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-400" />
                <span>Cài đặt Trình soạn thảo</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Theme Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Giao diện (Theme Syntax Highlighting):</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(IDE_THEMES).map((thm) => (
                  <button
                    key={thm.id}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, theme: thm.id }))}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold cursor-pointer ${
                      settings.theme === thm.id
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{thm.name}</span>
                    <span className={`w-2.5 h-2.5 rounded-full ${thm.badgeBg}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Cỡ chữ (Font Size):</label>
              <div className="flex items-center gap-2">
                {[12, 14, 16, 18, 20].map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, fontSize: sz }))}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      settings.fontSize === sz
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {sz}px
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Size */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Độ thụt lề (Tab Size):</label>
              <div className="flex items-center gap-2">
                {[2, 4].map((ts) => (
                  <button
                    key={ts}
                    type="button"
                    onClick={() => setSettings((s) => ({ ...s, tabSize: ts }))}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      settings.tabSize === ts
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {ts} spaces
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs cursor-pointer"
            >
              Lưu & Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
