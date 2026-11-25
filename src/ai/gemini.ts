import { Rubric } from '../core/types.ts';
import { APP_NAME } from '../core/brand.ts';
import {
  AiChatContext,
  AiChatHistoryItem,
  AiRubricEvaluation,
  FailingTestDiagnostic,
} from './aiPrompts.ts';
import {
  evaluateWithRubricFallback,
  explainCodeLineFallback,
  diagnoseFailingTestFallback,
} from './rubricCheck.ts';

// Khóa chống gọi đồng thời cho các tác vụ chấm bài tự động
let isAiRunning = false;

export function getIsAiRunning(): boolean {
  return isAiRunning;
}

export interface RubricEvaluationResult {
  evaluation: AiRubricEvaluation;
  isFallback: boolean;
  statusMessage?: string;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  body: unknown,
  timeoutMs = 45000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error(errData?.message || errData?.error || `HTTP_${response.status}`);
      (err as any).code = errData?.error || `HTTP_${response.status}`;
      throw err;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chấm Rubric bằng Gemini AI phía máy chủ, có cơ chế fallback không AI đầy đủ
 */
export async function evaluateStudentAnswer(params: {
  statement: string;
  rubric: Rubric;
  studentText: string;
  attemptNo: number;
  previousFeedback?: string;
  hiddenReference: string;
  mode?: 'level1' | 'level2_rule';
}): Promise<RubricEvaluationResult> {
  const { rubric, studentText, attemptNo } = params;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      evaluation: evaluateWithRubricFallback({ rubric, studentText, attemptNo }),
      isFallback: true,
      statusMessage: 'Thiết bị đang offline. Đang chạy ở Chế độ không AI.',
    };
  }

  if (isAiRunning) {
    return {
      evaluation: evaluateWithRubricFallback({ rubric, studentText, attemptNo }),
      isFallback: true,
      statusMessage: 'Hệ thống đang xử lý một câu hỏi khác. Vui lòng thử lại sau giây lát.',
    };
  }

  isAiRunning = true;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const data = await fetchJsonWithTimeout<{ evaluation: AiRubricEvaluation }>(
        '/api/ai/evaluate',
        params,
        45000
      );

      isAiRunning = false;
      return {
        evaluation: data.evaluation,
        isFallback: false,
      };
    } catch (err: any) {
      console.warn(`[${APP_NAME} AI] Lần gọi ${attempt} thất bại:`, err?.message || err);
      if (err?.code === 'MISSING_API_KEY') {
        isAiRunning = false;
        return {
          evaluation: evaluateWithRubricFallback({ rubric, studentText, attemptNo }),
          isFallback: true,
          statusMessage: 'Máy chủ chưa kích hoạt Gemini API. Đang chạy ở Chế độ so khớp từ khóa.',
        };
      }
      if (attempt === 2) {
        isAiRunning = false;
        return {
          evaluation: evaluateWithRubricFallback({ rubric, studentText, attemptNo }),
          isFallback: true,
          statusMessage: 'Không thể kết nối tới máy chủ AI hoặc phản hồi quá 20s. Đã chuyển sang Chế độ không AI.',
        };
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  isAiRunning = false;
  return {
    evaluation: evaluateWithRubricFallback({ rubric, studentText, attemptNo }),
    isFallback: true,
  };
}

/**
 * Giải thích dòng code chi tiết cho học sinh mới (Cấp 4)
 */
export async function explainCodeLineWithAi(params: {
  codeLine: string;
  lineNote: string;
  lineNumber: number;
  lessonTitle: string;
  codeContext: string[];
}): Promise<{ explanation: string; isFallback: boolean }> {
  const { codeLine, lineNote, lineNumber } = params;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return {
      explanation: explainCodeLineFallback(codeLine, lineNote, lineNumber),
      isFallback: true,
    };
  }

  try {
    const data = await fetchJsonWithTimeout<{ explanation: string }>(
      '/api/ai/explain-line',
      params,
      45000
    );
    if (data.explanation) {
      return { explanation: data.explanation, isFallback: false };
    }
  } catch (e) {
    console.warn(`[${APP_NAME} AI] Giải thích dòng code thất bại, dùng fallback:`, e);
  }

  return {
    explanation: explainCodeLineFallback(codeLine, lineNote, lineNumber),
    isFallback: true,
  };
}

/**
 * Giải thích vì sao cách làm này đúng và nhanh (Cấp 4 lớp 3)
 */
export async function explainWhyFastWithAi(params: {
  lessonTitle: string;
  statement: string;
  code: string[];
  analysisNote?: string;
}): Promise<{ explanation: string; isFallback: boolean }> {
  const { analysisNote } = params;
  const defaultFallback =
    analysisNote ||
    `Thuật toán này thực hiện từng bước tuần tự có mục đích rõ ràng, tránh tính toán dư thừa và luôn hoàn thành trong giới hạn tài nguyên cho phép của bài toán.`;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { explanation: defaultFallback, isFallback: true };
  }

  try {
    const data = await fetchJsonWithTimeout<{ explanation: string }>(
      '/api/ai/explain-fast',
      params,
      45000
    );
    if (data.explanation) {
      return { explanation: data.explanation, isFallback: false };
    }
  } catch {
    // ignore and use fallback
  }

  return { explanation: defaultFallback, isFallback: true };
}

/**
 * Phân tích test sai nhỏ nhất bằng Gemini (Requirement 8)
 */
export async function diagnoseFailingTestWithGemini(params: {
  statement: string;
  constraints: string;
  studentCode: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  commonMistakes: string[];
}): Promise<{ diagnostic: FailingTestDiagnostic; isFallback: boolean }> {
  const { input, expectedOutput, actualOutput, commonMistakes } = params;

  const fallback = diagnoseFailingTestFallback({
    input,
    expectedOutput,
    actualOutput,
    commonMistakes,
  });

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { diagnostic: fallback, isFallback: true };
  }

  try {
    const data = await fetchJsonWithTimeout<{ diagnostic: FailingTestDiagnostic }>(
      '/api/ai/diagnose-test',
      params,
      45000
    );
    if (data.diagnostic?.analysis && data.diagnostic?.pedagogicalQuestion) {
      return { diagnostic: data.diagnostic, isFallback: false };
    }
  } catch (err) {
    console.warn(`[${APP_NAME} AI] Phân tích lỗi test thất bại, dùng fallback:`, err);
  }

  return { diagnostic: fallback, isFallback: true };
}

/**
 * Gửi tin nhắn tới Trợ lý AI Chat (streaming SSE theo thời gian thực)
 */
export async function streamAiChat(params: {
  message: string;
  history: AiChatHistoryItem[];
  context?: AiChatContext;
  signal?: AbortSignal;
  onDelta: (chunkText: string) => void;
}): Promise<string> {
  const { message, history, context, signal, onDelta } = params;

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Thiết bị đang ngoại tuyến. Vui lòng kiểm tra kết nối mạng để trò chuyện với Trợ lý AI.');
  }

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      history,
      context,
    }),
    signal,
  });

  if (!response.ok) {
    const errPayload = await response.json().catch(() => ({}));
    throw new Error(
      errPayload?.message || `Không thể kết nối tới Trợ lý AI (Mã lỗi ${response.status}).`
    );
  }

  if (!response.body) {
    throw new Error('Trình duyệt không hỗ trợ đọc luồng phản hồi từ máy chủ.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let accumulated = '';

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const rawJson = trimmed.slice(5).trim();
    if (!rawJson) return;

    let parsed: { text?: string; done?: boolean; error?: string; message?: string };
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return;
    }

    if (parsed.error) {
      throw new Error(parsed.message || 'Trợ lý AI gặp sự cố khi trả lời.');
    }

    if (typeof parsed.text === 'string' && parsed.text.length > 0) {
      accumulated += parsed.text;
      onDelta(parsed.text);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      processLine(line);
    }
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  return accumulated;
}
