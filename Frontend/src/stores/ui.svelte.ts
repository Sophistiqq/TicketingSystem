// ============================================================
// UI Store — global modals (confirm, prompt, etc.)
// ============================================================

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  withInput?: boolean;
  placeholder?: string;
  defaultValue?: string;
};

type ConfirmResult = {
  confirmed: boolean;
  value?: string;
};

let modalState = $state<{
  show: boolean;
  options: ConfirmOptions;
  resolve: (result: ConfirmResult) => void;
} | null>(null);

let hideChromeState = $state(false);

export function getModalState() {
  return modalState;
}

export function isChromeHidden() {
  return hideChromeState;
}

export function setHideChrome(hide: boolean) {
  hideChromeState = hide;
}

export function confirm(options: ConfirmOptions | string): Promise<ConfirmResult> {
  const opts: ConfirmOptions = typeof options === 'string' ? { message: options } : options;
  
  return new Promise((resolve) => {
    modalState = {
      show: true,
      options: opts,
      resolve
    };
  });
}

/**
 * Shorthand for simple confirmation
 */
export async function simpleConfirm(message: string, destructive = false): Promise<boolean> {
  const result = await confirm({ message, destructive });
  return result.confirmed;
}

/**
 * Shorthand for simple prompt
 */
export async function simplePrompt(message: string, placeholder = "", defaultValue = ""): Promise<string | null> {
  const result = await confirm({ 
    message, 
    withInput: true, 
    placeholder, 
    defaultValue 
  });
  return result.confirmed ? (result.value ?? "") : null;
}

export function closeModal(confirmed: boolean, value?: string) {
  if (modalState) {
    modalState.resolve({ confirmed, value });
    modalState = null;
  }
}
