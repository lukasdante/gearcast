/** Markdown renderer for Caster's answers (GFM tables/lists; raw HTML is not rendered). */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml
        components={{
          a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
          table: ({ children }) => <div className="md-table"><table>{children}</table></div>,
        }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
