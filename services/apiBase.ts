/**
 * Where the app sends its requests. The server also hosts the website, so a deployed app talks
 * to the address it was opened on (www.nctrental.com, nctrental.com, the Render address or any
 * future domain). Only local development, which runs the website separately, uses VITE_API_URL.
 */
const configured = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:8080';
const isWeb = typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol);
const base = isWeb && !import.meta.env.DEV ? window.location.origin : configured;
export const API_BASE = base.endsWith('/') ? base.slice(0, -1) : base;
