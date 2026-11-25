import { GoogleGenAI, Type, Schema } from '@google/genai';
import { Rubric } from '../src/core/types.ts';
import {
  AI_CHAT_SYSTEM_INSTRUCTION,
  AiChatContext,
  AiChatHistoryItem,
  AiRubricEvaluation,
  EVALUATION_SYSTEM_INSTRUCTION,
  EXPLAIN_LINE_SYSTEM_INSTRUCTION,
  FAILING_TEST_DIAGNOSTIC_INSTRUCTION,
  FailingTestDiagnostic,
  buildFailingTestDiagnosticPrompt,
  buildRubricEvaluationPrompt,
} from '../src/ai/aiPrompts.ts';

export const GEMINI_MODEL = 'gemini-4-hydrogen';

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY?.trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY');
}

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const err = new Error('MISSING_API_KEY');
    (err as any).code = 'MISSING_API_KEY';
    throw err;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = 45000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('AI_TIMEOUT: Quá thời gian chờ phản hồi từ Gemini')), timeoutMs)
    ),
  ]);
}

const rubricResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    matchedIdeaIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Danh sách các id ý cốt lõi mà học sinh đã đạt được',
    },
    missingIdeaIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Danh sách các id ý cốt lõi học sinh còn thiếu',
    },
    misconceptions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Các điểm hiểu lầm hoặc sai sót nếu có',
    },
    praise: {
      type: Type.STRING,
      description: 'Lời khen ngợi các điểm tốt, động viên học sinh (1-2 câu tiếng Việt)',
    },
    nextQuestion: {
      type: Type.STRING,
      description: 'Một câu hỏi gợi mở duy nhất hướng vào ý thiếu quan trọng nhất',
    },
    hintLevel: {
      type: Type.INTEGER,
      description: 'Bậc gợi ý từ 1 đến 4',
    },
    complexityOk: {
      type: Type.BOOLEAN,
      description: 'Học sinh có hiểu đúng về độ phức tạp thuật toán hay không',
    },
  },
  required: ['matchedIdeaIds', 'missingIdeaIds', 'praise', 'nextQuestion', 'hintLevel'],
};

const diagnosticSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    trapType: {
      type: Type.STRING,
      enum: ['index_offset', 'edge_case', 'format_error', 'complexity', 'logic_branch', 'unknown'],
    },
    trapTitle: { type: Type.STRING },
    analysis: { type: Type.STRING },
    pedagogicalQuestion: { type: Type.STRING },
  },
  required: ['trapType', 'trapTitle', 'analysis', 'pedagogicalQuestion'],
};

function buildContextInstruction(context?: AiChatContext): string {
  if (!context) return AI_CHAT_SYSTEM_INSTRUCTION;

  const contextLines: string[] = [];
  if (context.itemTitle) {
    contextLines.push(`- Bài học / Bài tập đang mở: "${context.itemTitle}"`);
  }
  if (context.kind && context.kind !== 'general') {
    const kindLabels: Record<string, string> = {
      concept: 'Học khái niệm Python',
      algorithm: 'Mô phỏng thuật toán',
      problem: 'Giải bài tập thuật toán',
      exam: 'Luyện thi HSG Tin học',
      ide: 'Thực hành viết & gỡ lỗi trên IDE Python',
    };
    contextLines.push(`- Chế độ học: ${kindLabels[context.kind] || context.kind}`);
  }
  if (context.pathname) {
    contextLines.push(`- Đường dẫn hiện tại: ${context.pathname}`);
  }
  if (context.itemSummary) {
    contextLines.push(`- Tóm tắt nội dung đang xem: ${context.itemSummary.slice(0, 600)}`);
  }

  if (contextLines.length === 0) return AI_CHAT_SYSTEM_INSTRUCTION;

  return `${AI_CHAT_SYSTEM_INSTRUCTION}

[NGỮ CẢNH HIỆN TẠI CỦA HỌC SINH TRONG ỨNG DỤNG]
${contextLines.join('\n')}
Hãy ưu tiên bám sát ngữ cảnh này nếu câu hỏi của học sinh có liên quan (ví dụ: "bài này", "đoạn code này", "ý tưởng thế nào").`;
}

export async function streamAiChatServer(params: {
  message: string;
  history?: AiChatHistoryItem[];
  context?: AiChatContext;
  onChunk: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const { message, history = [], context, onChunk, signal } = params;
  const ai = getAiClient();

  const formattedHistory = history
    .filter(
      (item) =>
        item &&
        (item.role === 'user' || item.role === 'model') &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0
    )
    .slice(-24)
    .map((item) => ({
      role: item.role,
      parts: [{ text: item.text }],
    }));

  const systemInstruction = buildContextInstruction(context);

  const chat = ai.chats.create({
    model: GEMINI_MODEL,
    history: formattedHistory,
    config: {
      systemInstruction,
    },
  });

  const stream = await chat.sendMessageStream({ message });
  let fullText = '';

  for await (const chunk of stream) {
    if (signal?.aborted) {
      break;
    }
    const delta = chunk.text;
    if (delta) {
      fullText += delta;
      onChunk(delta);
    }
  }

  return fullText;
}

export async function evaluateRubricServer(params: {
  statement: string;
  rubric: Rubric;
  studentText: string;
  attemptNo: number;
  previousFeedback?: string;
  hiddenReference: string;
  mode?: 'level1' | 'level2_rule';
}): Promise<AiRubricEvaluation> {
  const ai = getAiClient();
  const prompt = buildRubricEvaluationPrompt(params);

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: EVALUATION_SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: rubricResponseSchema,
      },
    }),
    45000
  );

  const text = response.text?.trim();
  if (!text) {
    throw new Error('AI trả về phản hồi rỗng');
  }

  const parsed = JSON.parse(text) as AiRubricEvaluation;
  return {
    matchedIdeaIds: Array.isArray(parsed.matchedIdeaIds) ? parsed.matchedIdeaIds : [],
    missingIdeaIds: Array.isArray(parsed.missingIdeaIds) ? parsed.missingIdeaIds : [],
    misconceptions: Array.isArray(parsed.misconceptions) ? parsed.misconceptions : [],
    praise: parsed.praise || 'Thầy/cô ghi nhận nỗ lực suy nghĩ của em.',
    nextQuestion: parsed.nextQuestion || 'Em hãy suy nghĩ thêm về bài toán nhé!',
    hintLevel: Math.min(4, Math.max(1, parsed.hintLevel || params.attemptNo)) as 1 | 2 | 3 | 4,
    complexityOk: parsed.complexityOk,
  };
}

export async function explainCodeLineServer(params: {
  codeLine: string;
  lineNote: string;
  lineNumber: number;
  lessonTitle: string;
  codeContext: string[];
}): Promise<string> {
  const { codeLine, lineNote, lineNumber, lessonTitle, codeContext } = params;
  const ai = getAiClient();

  const prompt = `Bài học: "${lessonTitle}".
Dòng code thứ ${lineNumber}:
\`\`\`python
${codeLine}
\`\`\`
Chú thích ban đầu: "${lineNote}".
Toàn bộ mã nguồn:
\`\`\`python
${codeContext.map((l, i) => `${i + 1}: ${l}`).join('\n')}
\`\`\`
Hãy giải thích dòng code ${lineNumber} cho học sinh lớp 6-9 hiểu một cách trực quan, tối đa 4 câu, kèm 1 ví dụ đời thường.`;

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: EXPLAIN_LINE_SYSTEM_INSTRUCTION,
      },
    }),
    45000
  );

  const text = response.text?.trim();
  if (!text) {
    throw new Error('AI trả về phản hồi rỗng');
  }
  return text;
}

export async function explainWhyFastServer(params: {
  lessonTitle: string;
  statement: string;
  code: string[];
  analysisNote?: string;
}): Promise<string> {
  const { lessonTitle, statement, code, analysisNote } = params;
  const ai = getAiClient();

  const prompt = `Bài học: "${lessonTitle}".
Đề bài: "${statement}".
Mã nguồn:
\`\`\`python
${code.join('\n')}
\`\`\`
Ghi chú phân tích: "${analysisNote || ''}".
Hãy giải thích ngắn gọn trong 2-3 câu: Tại sao cách giải này lại đúng đắn và tối ưu về thời gian chạy/bộ nhớ? Dùng ngôn từ dễ hiểu cho học sinh thi Tin học trẻ.`;

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: EVALUATION_SYSTEM_INSTRUCTION,
      },
    }),
    45000
  );

  const text = response.text?.trim();
  if (!text) {
    throw new Error('AI trả về phản hồi rỗng');
  }
  return text;
}

export async function diagnoseFailingTestServer(params: {
  statement: string;
  constraints: string;
  studentCode: string;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  commonMistakes: string[];
}): Promise<FailingTestDiagnostic> {
  const ai = getAiClient();
  const prompt = buildFailingTestDiagnosticPrompt(params);

  const response = await withTimeout(
    ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        systemInstruction: FAILING_TEST_DIAGNOSTIC_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: diagnosticSchema,
      },
    }),
    45000
  );

  const text = response.text?.trim();
  if (!text) {
    throw new Error('AI trả về phản hồi rỗng');
  }

  const parsed = JSON.parse(text) as FailingTestDiagnostic;
  if (!parsed.analysis || !parsed.pedagogicalQuestion) {
    throw new Error('Phản hồi JSON thiếu trường bắt buộc');
  }
  return parsed;
}
