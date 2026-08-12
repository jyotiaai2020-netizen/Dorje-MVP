import type { ReactNode } from 'react';
import { BlockMath, InlineMath } from 'react-katex';

function inline(text: string): ReactNode[] {
  return text.split(/(\[[^\]\n]+\]\(https?:\/\/[^)\s]+[^)]*\)|\$[^$\n]+\$|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((part, index) => {
    const link = part.match(/^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+[^)]*)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-300 underline decoration-emerald-300/40 underline-offset-4 hover:text-emerald-200">{link[1]}</a>;
    if (part.startsWith('$') && part.endsWith('$')) return <InlineMath key={index} math={part.slice(1, -1)} errorColor="#fda4af" />;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function cells(line: string) {
  return line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
}

export default function FormattedContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    if (line === '$$') {
      const formula: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== '$$') formula.push(lines[index++]);
      if (index < lines.length) index += 1;
      blocks.push(<div key={`formula-${index}`} className="my-4 overflow-x-auto rounded-xl border border-emerald-400/10 bg-slate-950/60 px-3 py-4 text-center"><BlockMath math={formula.join('\n')} errorColor="#fda4af" /></div>);
      continue;
    }
    if (line.startsWith('$$') && line.endsWith('$$') && line.length > 4) {
      blocks.push(<div key={`formula-${index}`} className="my-4 overflow-x-auto rounded-xl border border-emerald-400/10 bg-slate-950/60 px-3 py-4 text-center"><BlockMath math={line.slice(2, -2)} errorColor="#fda4af" /></div>);
      index += 1;
      continue;
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('|')) tableLines.push(lines[index++].trim());
      const rows = tableLines.filter((item) => !/^\|?[\s:|-]+\|?$/.test(item)).map(cells);
      if (rows.length) blocks.push(<div key={`table-${index}`} className="my-3 overflow-x-auto"><table className="min-w-full border-collapse text-left text-xs"><thead><tr>{rows[0].map((cell, cellIndex) => <th key={cellIndex} className="border border-slate-600 bg-slate-900 px-3 py-2 font-semibold">{inline(cell)}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-700 px-3 py-2 align-top">{inline(cell)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (line.startsWith('### ')) blocks.push(<h4 key={index} className="mt-3 text-sm font-semibold text-emerald-200">{inline(line.slice(4))}</h4>);
    else if (line.startsWith('## ')) blocks.push(<h3 key={index} className="mt-4 text-base font-semibold text-emerald-200">{inline(line.slice(3))}</h3>);
    else if (line.startsWith('# ')) blocks.push(<h2 key={index} className="mt-4 text-lg font-semibold text-white">{inline(line.slice(2))}</h2>);
    else if (/^[-*]\s+/.test(line)) blocks.push(<ul key={index} className="ml-5 list-disc"><li>{inline(line.replace(/^[-*]\s+/, ''))}</li></ul>);
    else if (/^\d+[.)]\s+/.test(line)) blocks.push(<ol key={index} className="ml-5 list-decimal"><li>{inline(line.replace(/^\d+[.)]\s+/, ''))}</li></ol>);
    else blocks.push(<p key={index} className="my-1 whitespace-pre-wrap">{inline(line)}</p>);
    index += 1;
  }
  return <div>{blocks}</div>;
}
