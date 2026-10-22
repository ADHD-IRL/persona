import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownContent({children,referenceLinks={},className="",...props}) {
 return <div {...props} className={"markdown-content text-sm min-w-0 break-words leading-relaxed "+className}><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
  a:({href,children})=>Object.hasOwn(referenceLinks,href)?<button type="button" data-ui="reference" className="text-amber-300 underline underline-offset-2" onClick={referenceLinks[href]}>{children}</button>:<a data-ui="reference" href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
  img:({alt})=><span>{alt?'Image: '+alt:'Image omitted'}</span>,
  table:({children})=><div className="markdown-table-scroll" role="region" aria-label="Table" tabIndex={0}><table>{children}</table></div>,
 }}>{String(children||'')}</ReactMarkdown></div>;
}
