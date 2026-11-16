import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function nlDate(value: Date | string) {
  return new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
export function nlTime(value: Date | string) {
  return new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}
