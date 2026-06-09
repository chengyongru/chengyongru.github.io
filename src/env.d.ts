/// <reference types="astro/client" />

interface Window {
  _bgCleanup?: () => void | Promise<void>;
}
