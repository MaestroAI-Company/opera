import { HUB_URL_SCHEME } from "./SamplerHubService";

//llama.cpp on the sampler, the hub provider id
export const LLAMA_SERVER_URL = `${HUB_URL_SCHEME}llamacpp`;

//0 keeps the llama.cpp default for each option
export const CTX_SIZE_OPTIONS = [
  { id: "0", label: "Auto" },
  { id: "8192", label: "8k" },
  { id: "16384", label: "16k" },
  { id: "32768", label: "32k" },
  { id: "65536", label: "64k" },
  { id: "131072", label: "128k" },
  { id: "262144", label: "256k" },
];

export const KEEP_ALIVE_OPTIONS = [
  { id: "300", label: "5m" },
  { id: "900", label: "15m" },
  { id: "1800", label: "30m" },
  { id: "3600", label: "1h" },
  { id: "7200", label: "2h" },
  { id: "43200", label: "12h" },
  { id: "0", label: "∞" },
];

export const PARALLEL_OPTIONS = [
  { id: "0", label: "Auto" },
  { id: "1", label: "1" },
  { id: "2", label: "2" },
  { id: "4", label: "4" },
  { id: "8", label: "8" },
];

//a value no step matches shows as is
export function optionLabel(options: { id: string; label: string }[], value: number): string {
  return options.find((option) => option.id === String(value))?.label ?? String(value);
}
