// Lets the engine's tsconfig (which includes tests/) read the bun-run spec.
declare module 'bun:test' {
  export const describe: (name: string, body: () => void) => void
  export const test: (name: string, body: () => unknown) => void
  export const expect: (value: unknown) => any
}
