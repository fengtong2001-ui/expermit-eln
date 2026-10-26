import type { ComponentType } from 'react'
import { Beaker, Calculator, Dna, FileImage, FlaskConical, FlaskRound, Grid3x3, ListChecks, Rows3, Syringe, Table2, Type } from 'lucide-react'
import type { BlockType } from './defs'
import type { BlockEditorProps } from './types'
import { TextBlock } from './TextBlock'
import { FilesBlock } from './FilesBlock'
import { TableBlock } from './TableBlock'
import { PlateBlock } from './PlateBlock'
import { ReagentsBlock } from './ReagentsBlock'
import { ProtocolBlock } from './ProtocolBlock'
import { LanesBlock } from './LanesBlock'
import { AntibodiesBlock } from './AntibodiesBlock'
import { QpcrBlock } from './QpcrBlock'
import { CultureBlock } from './CultureBlock'
import { BcaBlock } from './BcaBlock'

export { cloneBlockData } from './defs'

export const EDITORS: Record<BlockType, ComponentType<BlockEditorProps<any>>> = {
  text: TextBlock,
  files: FilesBlock,
  table: TableBlock,
  plate: PlateBlock,
  reagents: ReagentsBlock,
  protocol: ProtocolBlock,
  lanes: LanesBlock,
  antibodies: AntibodiesBlock,
  qpcr: QpcrBlock,
  culture: CultureBlock,
  bca: BcaBlock,
}

export const ICONS: Record<BlockType, ComponentType<{ className?: string }>> = {
  text: Type,
  files: FileImage,
  table: Table2,
  plate: Grid3x3,
  reagents: Beaker,
  protocol: ListChecks,
  lanes: Rows3,
  antibodies: Syringe,
  qpcr: Calculator,
  culture: FlaskRound,
  bca: FlaskConical,
}

export const FallbackIcon = Dna
