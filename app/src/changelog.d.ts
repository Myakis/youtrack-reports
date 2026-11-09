// CHANGELOG.md встраивается в сборку текстом (esbuild loader «text»).
declare module '*.md' {
  const text: string;
  export default text;
}
