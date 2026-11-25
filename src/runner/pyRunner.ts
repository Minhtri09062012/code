import { PYODIDE_WORKER_SCRIPT } from './pyodideWorkerCode.ts';
import { FriendlyError, translatePythonError } from './errorTranslator.ts';
import { Step } from '../core/types.ts';

export interface TestRunResult {
  status: 'ok' | 'runtime' | 'timeout' | 'cdn_error';
  output: string;
  error?: FriendlyError;
  elapsedMs: number;
}

export interface TraceRunResult {
  status: 'ok' | 'runtime' | 'timeout' | 'cdn_error';
  steps: Step[];
  finalOutput: string;
  error?: FriendlyError;
}

let workerInstance: Worker | null = null;
let msgIdCounter = 0;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

function getWorker(): Worker {
  if (!workerInstance) {
    const blob = new Blob([PYODIDE_WORKER_SCRIPT], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    workerInstance = new Worker(url);
  }
  return workerInstance;
}

function terminateWorker() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
    initPromise = null;
    isInitializing = false;
  }
}

/**
 * Khởi tạo Pyodide trước nếu cần
 */
export async function initPyodideWorker(): Promise<{ ok: boolean; error?: string }> {
  if (initPromise) return initPromise.then(() => ({ ok: true })).catch((e) => ({ ok: false, error: e.message }));

  initPromise = new Promise<void>((resolve, reject) => {
    try {
      const worker = getWorker();
      const id = ++msgIdCounter;

      const handler = (e: MessageEvent) => {
        if (e.data.id === id) {
          worker.removeEventListener('message', handler);
          if (e.data.type === 'INIT_OK') {
            resolve();
          } else {
            reject(new Error(e.data.error || 'Khởi tạo Pyodide thất bại'));
          }
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({ id, type: 'INIT' });
    } catch (err: any) {
      reject(err);
    }
  });

  try {
    await initPromise;
    return { ok: true };
  } catch (err: any) {
    terminateWorker();
    return {
      ok: false,
      error:
        err?.message ||
        'Không thể nạp thư viện Python Pyodide từ CDN. Vui lòng kiểm tra kết nối Internet để chạy mã Python.',
    };
  }
}

/**
 * Chạy 1 test case với code Python
 */
export async function runPythonTest(
  code: string,
  input: string,
  ioMode: { kind: 'stdio' } | { kind: 'file'; inputFile: string; outputFile: string } = { kind: 'stdio' },
  timeLimitSec: number = 3
): Promise<TestRunResult> {
  const startTime = Date.now();
  let timer: any = null;

  return new Promise<TestRunResult>(async (resolve) => {
    let worker: Worker;
    try {
      worker = getWorker();
    } catch (err: any) {
      return resolve({
        status: 'cdn_error',
        output: '',
        error: translatePythonError(err?.message || 'Không tạo được Worker'),
        elapsedMs: 0,
      });
    }

    const id = ++msgIdCounter;
    let completed = false;

    // Timeout watchdog
    timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        terminateWorker(); // Dừng worker để huỷ vòng lặp vô hạn
        const elapsedMs = Date.now() - startTime;
        resolve({
          status: 'timeout',
          output: '',
          error: translatePythonError('Timeout: Quá thời gian thực thi.'),
          elapsedMs,
        });
      }
    }, timeLimitSec * 1000);

    const handler = (e: MessageEvent) => {
      if (e.data && e.data.id === id) {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        worker.removeEventListener('message', handler);

        const elapsedMs = Date.now() - startTime;

        if (e.data.type === 'EXEC_TEST_OK') {
          resolve({
            status: 'ok',
            output: e.data.output || '',
            elapsedMs,
          });
        } else if (e.data.type === 'INIT_ERROR') {
          resolve({
            status: 'cdn_error',
            output: '',
            error: translatePythonError(e.data.error || 'Lỗi nạp Pyodide'),
            elapsedMs,
          });
        } else {
          // Runtime / Syntax error
          const rawErr = e.data.error || 'Lỗi không xác định';
          resolve({
            status: 'runtime',
            output: '',
            error: translatePythonError(rawErr),
            elapsedMs,
          });
        }
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({
      id,
      type: 'EXEC_TEST',
      payload: { code, input, ioMode },
    });
  });
}

/**
 * Chạy code học sinh với sys.settrace để thu thập từng bước (Line, Vars, Highlights)
 * Tối đa 500 bước, biến cắt ngắn 40 ký tự
 */
export async function runPythonTrace(
  code: string,
  input: string,
  maxSteps: number = 500,
  timeLimitSec: number = 4
): Promise<TraceRunResult> {
  let timer: any = null;

  return new Promise<TraceRunResult>(async (resolve) => {
    let worker: Worker;
    try {
      worker = getWorker();
    } catch (err: any) {
      return resolve({
        status: 'cdn_error',
        steps: [],
        finalOutput: '',
        error: translatePythonError(err?.message || 'Không tạo được Worker'),
      });
    }

    const id = ++msgIdCounter;
    let completed = false;

    timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        terminateWorker();
        resolve({
          status: 'timeout',
          steps: [],
          finalOutput: '',
          error: translatePythonError('Timeout: Quá thời gian khi mô phỏng code học sinh.'),
        });
      }
    }, timeLimitSec * 1000);

    const handler = (e: MessageEvent) => {
      if (e.data && e.data.id === id) {
        if (completed) return;
        completed = true;
        clearTimeout(timer);
        worker.removeEventListener('message', handler);

        if (e.data.type === 'EXEC_TRACE_OK') {
          const raw = e.data.data;
          const rawSteps = raw.steps || [];
          const finalOutput = raw.finalOutput || '';
          const runtimeError = raw.runtimeError ? translatePythonError(raw.runtimeError) : undefined;

          // Chuyển raw steps thành Step[] theo đúng hợp đồng dữ liệu
          const steps: Step[] = rawSteps.map((s: any, idx: number) => {
            const isLast = idx === rawSteps.length - 1;
            const varList = Object.entries(s.vars || {})
              .map(([k, v]) => `${k} = ${v}`)
              .join(', ');

            return {
              line: s.line || 1,
              vars: s.vars || {},
              highlights: [],
              explain: `Dòng ${s.line}${varList ? `: ${varList}` : ''}`,
              snapshot: s.vars || {},
              ops: s.ops || idx + 1,
              output: isLast ? finalOutput : undefined,
            };
          });

          resolve({
            status: runtimeError ? 'runtime' : 'ok',
            steps,
            finalOutput,
            error: runtimeError,
          });
        } else {
          resolve({
            status: 'runtime',
            steps: [],
            finalOutput: '',
            error: translatePythonError(e.data.error || 'Lỗi khi mô phỏng'),
          });
        }
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({
      id,
      type: 'EXEC_TRACE',
      payload: { code, input, maxSteps },
    });
  });
}
