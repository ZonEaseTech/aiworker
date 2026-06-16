import { BrowserRouter, Navigate, Route, Routes } from 'react-router'

import { AppSidebar } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AdminDataProvider } from '@/lib/admin-data-context'
import { AssignmentsPage } from '@/pages/assignments-page'
import { AuditPage } from '@/pages/audit-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { EnvironmentsPage } from '@/pages/environments-page'
import { ProvisioningPage } from '@/pages/provisioning-page'
import { SoulsPage } from '@/pages/souls-page'

export function App() {
  return (
    <BrowserRouter>
      <TooltipProvider>
        <AdminDataProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 md:hidden">
                <SidebarTrigger />
                <span className="text-sm font-semibold">AIWorker</span>
              </header>
              <main className="min-w-0 flex-1 p-4 md:p-6">
                <Routes>
                  <Route path="/" element={<DashboardPage />} />
                  <Route path="/assignments" element={<AssignmentsPage />} />
                  <Route path="/provisioning" element={<ProvisioningPage />} />
                  <Route path="/souls" element={<SoulsPage />} />
                  <Route path="/environments" element={<EnvironmentsPage />} />
                  <Route path="/audit" element={<AuditPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </AdminDataProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}

export default App
