/** Internal framework bridge. Source programs receive only declared primitive event fields. */
export interface FormEventBridge {
  form: HTMLFormElement; revision: number; generation: number; ticket: number; pending: boolean;
  life: AbortController; tasks: Set<Promise<unknown>>;
  release(ticket: number): void;
  cancelValidation?(): void;
  cancelAll?(): void;
  request?: import('./request.mjs').ActionRequest;
}
export interface CapturedFormEvent {
  bridge: FormEventBridge; revision: number; generation: number; ticket: number;
  field: string | null; entries: [string, FormDataEntryValue][];
}
export function captureFormEvent(document: Document, event: Event, form: HTMLFormElement): CapturedFormEvent | null;
export function disposeFormEvents(root: Element): void;
export function settleFormEvents(roots: Iterable<Element>): Promise<void>;
