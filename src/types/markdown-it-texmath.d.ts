declare module 'markdown-it-texmath' {
  import type MarkdownIt from 'markdown-it'
  import type { KatexOptions } from 'katex'

  interface TexMathOptions {
    engine: {
      renderToString(tex: string, options?: KatexOptions): string
    }
    delimiters?: 'dollars' | 'brackets' | 'gitlab'
  }

  const texmath: (md: MarkdownIt, options: TexMathOptions) => void
  export default texmath
}
