import React, { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  code: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5 font-mono uppercase tracking-wider text-slate-300">
          <Terminal className="w-3 h-3 text-cyan-400" />
          {language || 'python'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-300">Đã chép</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Sao chép</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs sm:text-[13px] leading-relaxed font-mono text-slate-100">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderInlineFormatting(text: string): React.ReactNode[] {
  // Split inline code first (`...`)
  const codeSegments = text.split(/(`[^`]+`)/g);
  const nodes: React.ReactNode[] = [];

  codeSegments.forEach((seg, segIdx) => {
    if (seg.startsWith('`') && seg.endsWith('`') && seg.length >= 2) {
      nodes.push(
        <code
          key={`code-${segIdx}`}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-slate-800/90 border border-slate-700/70 text-cyan-300 font-mono text-[0.88em]"
        >
          {seg.slice(1, -1)}
        </code>
      );
      return;
    }

    // Bold (**...**) inside non-code text
    const boldSegments = seg.split(/(\*\*[^*]+\*\*)/g);
    boldSegments.forEach((bSeg, bIdx) => {
      if (bSeg.startsWith('**') && bSeg.endsWith('**') && bSeg.length >= 4) {
        nodes.push(
          <strong key={`bold-${segIdx}-${bIdx}`} className="font-bold text-white">
            {bSeg.slice(2, -2)}
          </strong>
        );
      } else if (bSeg) {
        nodes.push(<React.Fragment key={`txt-${segIdx}-${bIdx}`}>{bSeg}</React.Fragment>);
      }
    });
  });

  return nodes;
}

const TextBlock: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: { ordered: boolean; content: string }[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length === 0) return;
    const isOrdered = listItems[0].ordered;
    if (isOrdered) {
      elements.push(
        <ol key={`ol-${keyPrefix}`} className="list-decimal list-inside space-y-1 my-1.5 pl-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item.content)}
            </li>
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={`ul-${keyPrefix}`} className="list-disc list-inside space-y-1 my-1.5 pl-1">
          {listItems.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineFormatting(item.content)}
            </li>
          ))}
        </ul>
      );
    }
    listItems = [];
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList(`${idx}`);
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList(`${idx}`);
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      elements.push(
        <div
          key={`h-${idx}`}
          className={`font-bold text-white mt-2.5 mb-1 ${
            level === 1 ? 'text-base' : level === 2 ? 'text-sm' : 'text-[13px] text-blue-300'
          }`}
        >
          {renderInlineFormatting(headingText)}
        </div>
      );
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      if (listItems.length > 0 && listItems[0].ordered) {
        flushList(`${idx}`);
      }
      listItems.push({ ordered: false, content: bulletMatch[1] });
      return;
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (orderedMatch) {
      if (listItems.length > 0 && !listItems[0].ordered) {
        flushList(`${idx}`);
      }
      listItems.push({ ordered: true, content: orderedMatch[1] });
      return;
    }

    flushList(`${idx}`);

    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote
          key={`bq-${idx}`}
          className="border-l-2 border-blue-500/70 pl-3 py-0.5 my-1.5 text-slate-300 italic"
        >
          {renderInlineFormatting(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    elements.push(
      <p key={`p-${idx}`} className="leading-relaxed my-1">
        {renderInlineFormatting(line)}
      </p>
    );
  });

  flushList('end');

  return <>{elements}</>;
};

export const ChatMessageContent: React.FC<{ content: string; isStreaming?: boolean }> = ({
  content,
  isStreaming = false,
}) => {
  if (!content && isStreaming) {
    return (
      <div className="flex items-center gap-1.5 py-1 text-slate-400 text-xs">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:120ms]" />
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce [animation-delay:240ms]" />
        <span className="ml-1">Đang suy nghĩ...</span>
      </div>
    );
  }

  // Split fenced code blocks ```lang\n...\n```
  const parts: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'code',
      language: match[1] || 'python',
      content: match[2].replace(/\n$/, ''),
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    // Handle an unclosed ``` block while streaming
    const openFenceMatch = remaining.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*)$/);
    if (openFenceMatch && isStreaming) {
      const beforeOpen = remaining.slice(0, openFenceMatch.index);
      if (beforeOpen) {
        parts.push({ type: 'text', content: beforeOpen });
      }
      parts.push({
        type: 'code',
        language: openFenceMatch[1] || 'python',
        content: openFenceMatch[2],
      });
    } else {
      parts.push({ type: 'text', content: remaining });
    }
  }

  return (
    <div className="text-[13px] sm:text-sm text-slate-200 break-words space-y-1">
      {parts.map((part, idx) =>
        part.type === 'code' ? (
          <CodeBlock key={`cb-${idx}`} language={part.language || 'python'} code={part.content} />
        ) : (
          <TextBlock key={`tb-${idx}`} text={part.content} />
        )
      )}
    </div>
  );
};
