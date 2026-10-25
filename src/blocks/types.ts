export interface BlockEditorProps<T> {
  data: T
  onChange: (next: T) => void
  readOnly: boolean
  blockId: string
  experimentId: string
}
