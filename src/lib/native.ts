// macOS 原生壳注入的桥接对象（注入代码见 native/mac/main.swift 的 bridgeBootstrapJS）
// 浏览器里不存在，所有调用都要先判空

export interface MacBridge {
  isNative: boolean
  macosStyle?: string
  isFullscreen?: boolean
  startWindowDrag?: () => void
  /** 调起原生 NSSavePanel；isBase64 为 true 时 content 是 base64 字符串 */
  saveFile?: (filename: string, content: string, isBase64?: boolean) => void
  printPage?: () => void
}

declare global {
  interface Window {
    expermitMac?: MacBridge
  }
}

export function macBridge() {
  return typeof window === 'undefined' ? undefined : window.expermitMac
}

export function isNativeMac() {
  return !!macBridge()?.isNative
}

/** 交给原生保存面板；返回 false 表示当前不是原生壳，调用方应回退到浏览器下载 */
export async function saveBlobNatively(blob: Blob, filename: string): Promise<boolean> {
  const bridge = macBridge()
  if (!bridge?.saveFile) return false
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  bridge.saveFile(filename, btoa(bin), true)
  return true
}
