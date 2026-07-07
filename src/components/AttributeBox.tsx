interface Props {
  attributes: Record<string, string>
}

/**
 * 属性表组件
 * 接收已通过 markdown-it + KaTeX 渲染过的 HTML 键值对
 * 左侧（key）和右侧（value）均支持 LaTeX、Markdown 链接等
 */
export default function AttributeBox({ attributes }: Props) {
  const entries = Object.entries(attributes)
  if (entries.length === 0) return null

  return (
    <div className="attribute-box">
      <table>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <th dangerouslySetInnerHTML={{ __html: key }} />
              <td dangerouslySetInnerHTML={{ __html: value }} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
