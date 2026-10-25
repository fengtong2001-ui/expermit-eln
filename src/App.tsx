import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { createHashRouter, RouterProvider } from 'react-router'
import { Toaster, toast } from 'sonner'
import { Shell } from './components/Shell'
import { TooltipProvider } from './components/ui'
import { ConfirmHost } from './components/confirm'
import { PromptHost } from './components/prompt'
import { TodayPage } from './pages/Today'
import { ExperimentsPage } from './pages/Experiments'
import { NotFound } from './pages/NotFound'
import { ensureSeed } from './lib/seed'
import { startAutoSync } from './lib/sync/engine'
import { purgeExpiredTrash } from './lib/repo'
import { useTheme } from './lib/theme'

const ExperimentPage = lazy(() => import('./pages/Experiment').then((m) => ({ default: m.ExperimentPage })))
const ReagentsPage = lazy(() => import('./pages/Reagents').then((m) => ({ default: m.ReagentsPage })))
const SchedulePage = lazy(() => import('./pages/Schedule').then((m) => ({ default: m.SchedulePage })))
const TemplatesPage = lazy(() => import('./pages/Templates').then((m) => ({ default: m.TemplatesPage })))
const TrashPage = lazy(() => import('./pages/Trash').then((m) => ({ default: m.TrashPage })))
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))
const L = (n: ReactNode) => <Suspense fallback={null}>{n}</Suspense>

// Hash 路由：构建产物是纯静态文件，可直接放 GitHub Pages / 任意静态托管 / 本地打开
const router = createHashRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'experiments', element: <ExperimentsPage /> },
      { path: 'experiments/:id', element: L(<ExperimentPage />) },
      { path: 'reagents', element: L(<ReagentsPage />) },
      { path: 'schedule', element: L(<SchedulePage />) },
      { path: 'templates', element: L(<TemplatesPage />) },
      { path: 'trash', element: L(<TrashPage />) },
      { path: 'settings', element: L(<SettingsPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  const theme = useTheme()
  useEffect(() => {
    // 一次性导入同步配置：链接形如 ?setup=<base64url 的配置 JSON>
    const m = /setup=([A-Za-z0-9_-]+)/.exec(location.href)
    if (m) {
      try {
        const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))
        const cfg = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))))
        if (cfg?.provider === 'github' || cfg?.provider === 'webdav') {
          localStorage.setItem('eln-sync-config', JSON.stringify(cfg))
          history.replaceState(null, '', location.href.replace(/([?&])setup=[A-Za-z0-9_-]+&?/, '$1').replace(/[?&]$/, ''))
          toast.success('同步配置已导入，开始同步')
        }
      } catch {
        toast.error('配置链接无效')
      }
    }
    void ensureSeed()
    void purgeExpiredTrash()
    void navigator.storage?.persist?.()
    startAutoSync()
  }, [])
  return (
    <TooltipProvider>
      <RouterProvider router={router} />
      <ConfirmHost />
      <PromptHost />
      <Toaster
        position="bottom-center"
        theme={theme}
        toastOptions={{ className: '!rounded-xl !text-[13px] !font-sans', duration: 4000 }}
        offset={{ bottom: 88 }}
        mobileOffset={{ bottom: 88 }}
      />
    </TooltipProvider>
  )
}
