# Frontend React Rules

## State Management — RTK Query Is the Server State
- ALL server data fetched and cached via RTK Query endpoints in `api/*.api.ts`. Never copy API responses into `useState` or a Redux slice.
- Only two Redux slices exist: `auth.slice.ts` (token + user profile, persisted to localStorage) and `quizStream.slice.ts` (SSE generation/grading state).
- If you need server data in a component, use an RTK Query hook. If you're tempted to create a new slice for server data, stop — use RTK Query's cache.
- Use `selectFromResult` to subscribe to specific fields and prevent re-renders when unrelated data changes:
```typescript
const { name } = useGetSessionQuery(id, {
  selectFromResult: ({ data }) => ({ name: data?.session?.name }),
});
```

## RTK Query Base — Auth Handled Globally
- `baseQueryWithAuth` in `store/api.ts` injects `Authorization: Bearer <token>` from auth slice on every request. Never set auth headers in individual endpoints.
- Global 401 handler in `baseQueryWithAuth` dispatches `logout()` automatically. Never handle 401 in components.
- Use `useApiError(error)` hook to extract `{ message, code, details }` from any RTK Query error. Never parse error shapes manually in components.

## Forms — React Hook Form + Zod, Always
```typescript
const { register, handleSubmit, formState: { errors } } = useForm<CreateSessionInput>({
  resolver: zodResolver(createSessionSchema), // schema from @shared/schemas
});
```
- Every form uses this pattern. Zod schema imported from `packages/shared` — same schema validates on backend.

## CSS Modules — No Tailwind, No CSS-in-JS
- One `.module.css` file per component: `Button.module.css` alongside `Button.tsx`. Import as `import styles from './Button.module.css'`.
- Global design tokens (colors, fonts, spacing, radii) in `styles/global.css` as CSS variables: `var(--color-primary)`. Components reference these variables — never hardcode color/spacing values.
- No inline styles except truly dynamic values (e.g., progress bar width from a calculation).

## Code Splitting & Error Boundaries
- `React.lazy()` on every page component in `App.tsx` router. Wrap with `<Suspense fallback={<LoadingSpinner />}>`. Never lazy-load individual components within a page.
- Three error boundary levels: `RootErrorBoundary` (wraps app — full-page crash fallback), `RouteErrorBoundary` (wraps each route — error within layout, "Go to dashboard" link), `ComponentErrorBoundary` (wraps `QuestionCard` in loops, `MaterialUploader`, `QuizProgress` — inline error, retry button).
- Single reusable `ErrorBoundary` component with props: `fallback` (ReactNode or render function) and `onError` (reports to Sentry).

## Memoization — Targeted, Not Blanket
- `React.memo()` ONLY on components rendered in lists: `SessionCard`, `QuestionCard`, `QuestionResult`. Never on pages, layouts, or containers.
- `useMemo()` ONLY for expensive computations (score calculations, filtering/sorting arrays). Never for object/array literals.
- `useCallback()` ONLY for callbacks passed as props to `React.memo()` children. If the child isn't memoized, `useCallback` is pointless.

## SSE Hooks
- `useSSEStream<TEvent>(url, { onEvent, onComplete, onError, enabled })` — generic hook handling EventSource lifecycle, parsing, cleanup on unmount. No auto-reconnect (would trigger duplicate generation).
- `useQuizGeneration` and `useQuizGrading` wrap `useSSEStream` with quiz-specific logic. Collect events in a `useRef`, flush to `quizStream` Redux slice every 300ms — never dispatch on every individual SSE event.
