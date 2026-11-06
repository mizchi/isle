declare module 'virtual:isle-loader' {
  export function boot(options?: import('./client-contracts.d.ts').LoaderOptions): import('./client-contracts.d.ts').ResumeController | undefined;
}
