import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { useEffect, useRef } from 'react'
import { Bold, Code, Heading2, Italic, List, ListChecks, ListOrdered, Quote, Strikethrough } from 'lucide-react'
import type { BlockEditorProps } from './types'
import type { TextData } from './defs'
import { cn } from '@/lib/util'

export function TextBlock({ data, onChange, readOnly }: BlockEditorProps<TextData>) {
  const lastEmitted = useRef(data.html)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) => (node.type.name === 'heading' ? '标题' : '记录'),
      }),
    ],
    content: data.html,
    editable: !readOnly,
    editorProps: { attributes: { class: 'prose-eln', 'aria-label': '文本内容' } },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? '' : editor.getHTML()
      lastEmitted.current = html
      onChange({ html })
    },
  })

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  // 外部内容变化（恢复旧版本等）时同步
  useEffect(() => {
    if (!editor || data.html === lastEmitted.current) return
    lastEmitted.current = data.html
    editor.commands.setContent(data.html, { emitUpdate: false })
  }, [editor, data.html])

  if (!editor) return null
  const btn = (active: boolean) =>
    cn('flex size-7 cursor-pointer items-center justify-center rounded-md [&_svg]:size-3.5', active ? 'bg-white/20 text-white' : 'text-slate-400 hover:bg-white/10 hover:text-white')

  return (
    <div className="-mx-1 px-1">
      {!readOnly && (
        <BubbleMenu editor={editor} className="flex items-center gap-0.5 rounded-lg bg-slate-900 p-1 shadow-pop dark:bg-slate-700">
          <button className={btn(editor.isActive('heading', { level: 2 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} aria-label="标题">
            <Heading2 />
          </button>
          <button className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="加粗">
            <Bold />
          </button>
          <button className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="斜体">
            <Italic />
          </button>
          <button className={btn(editor.isActive('strike'))} onClick={() => editor.chain().focus().toggleStrike().run()} aria-label="删除线">
            <Strikethrough />
          </button>
          <button className={btn(editor.isActive('code'))} onClick={() => editor.chain().focus().toggleCode().run()} aria-label="代码">
            <Code />
          </button>
          <span className="mx-0.5 h-4 w-px bg-white/20" />
          <button className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="无序列表">
            <List />
          </button>
          <button className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="有序列表">
            <ListOrdered />
          </button>
          <button className={btn(editor.isActive('taskList'))} onClick={() => editor.chain().focus().toggleTaskList().run()} aria-label="待办">
            <ListChecks />
          </button>
          <button className={btn(editor.isActive('blockquote'))} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-label="引用">
            <Quote />
          </button>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
