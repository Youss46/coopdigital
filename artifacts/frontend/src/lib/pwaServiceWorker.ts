import { useRegisterSW } from "virtual:pwa-register/react";
import type { RegisterSWOptions } from "vite-plugin-pwa/types";

export function usePwaServiceWorker(options: RegisterSWOptions) {
  return useRegisterSW(options);
}
