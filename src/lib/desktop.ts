/** 桌面壳（Electron）注入的能力；网页版/PWA 下为 undefined */
export interface DesktopApi {
  /** 平台仓指定的“安装包/下载页”仓库（owner/repo）；缺省则用核心仓 */
  installerRepo?: string
  getInfo(): Promise<{ version: string; dataDir: string }>
  downloadUpdate(url: string): Promise<string>
  installUpdate(exePath: string): Promise<void>
  hotUpdate(ver: string): Promise<{ ok: boolean; needInstaller?: boolean }>
  pickDataDir(): Promise<string | null>
  applyDataDir(dir: string, deleteOld: boolean): Promise<'ok' | 'same'>
  onUpdateProgress(cb: (pct: number) => void): () => void
}

export const desktop: DesktopApi | undefined = (window as { expermitDesktop?: DesktopApi }).expermitDesktop
export const isDesktop = !!desktop
export const appVersion = __APP_VERSION__
