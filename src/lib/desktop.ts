/** 桌面壳（Electron）注入的能力；网页版/PWA 下为 undefined */
export interface DesktopApi {
  getInfo(): Promise<{ version: string; dataDir: string }>
  downloadUpdate(url: string): Promise<string>
  installUpdate(exePath: string): Promise<void>
  chooseDataDir(): Promise<string | null>
  onUpdateProgress(cb: (pct: number) => void): () => void
}

export const desktop: DesktopApi | undefined = (window as { expermitDesktop?: DesktopApi }).expermitDesktop
export const isDesktop = !!desktop
export const appVersion = __APP_VERSION__
