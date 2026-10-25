import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { createHashRouter, RouterProvider } from 'react-router'
import { Toaster } from 'sonner'
import { Shell } from './components/Shell'
import { TooltipProvider } from './components/ui'
import { ConfirmHost } from './components/confirm'
import { PromptHost } from './components/prompt'
import { TodayPage } from './pages/Today'
import { ExperimentsPage } from './pages/Experiments'
import { NotFound } from './pages/NotFound'
import { ensureSeed } from './lib/seed'
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
    void ensureSeed()
    void purgeExpiredTrash()
    void navigator.storage?.persist?.()
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
