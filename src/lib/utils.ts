import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatDate(date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function excelSerialToDate(serial): Date {
  // Excel starts on 1900-01-01, but has a leap year bug.
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899
  const days = Math.floor(serial);
  const msPerDay = 24 * 60 * 60 * 1000;

  // Add days + fractional days
  const date = new Date(excelEpoch.getTime() + serial * msPerDay);
  return date;
}
