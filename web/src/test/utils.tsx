import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

const testRootRoute = createRootRoute({ component: () => <Outlet /> })
const testIndexRoute = createRoute({
  getParentRoute: () => testRootRoute,
  path: '/',
  component: () => null,
})
const testCatchAllRoute = createRoute({
  getParentRoute: () => testRootRoute,
  path: '*',
  component: () => null,
})

function createTestRouter(initialEntry: string = '/') {
  const routeTree = testRootRoute.addChildren([testIndexRoute, testCatchAllRoute])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  return router
}

function AllProviders({ children }: { children: ReactNode }) {
  const queryClient = createTestQueryClient()
  const router = createTestRouter()
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {children}
    </QueryClientProvider>
  )
}

function customRender(ui: ReactNode, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options })
}

export { customRender as render }
export { default as userEvent } from '@testing-library/user-event'
export * from '@testing-library/react'
