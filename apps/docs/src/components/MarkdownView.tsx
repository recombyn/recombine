import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import type { Components } from 'react-markdown'

type Props = {
  markdown: string
  className?: string
}

function isInternal(href: string | undefined): href is string {
  return !!href && href.startsWith('/') && !href.startsWith('//')
}

const components: Components = {
  a({ href, children }) {
    if (isInternal(href)) {
      return <Link to={href}>{children}</Link>
    }
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
}

export function MarkdownView({ markdown, className }: Props) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
