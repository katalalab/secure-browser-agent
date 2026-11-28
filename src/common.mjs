// Small helpers shared across command modules.

export function yesNo(value) {
  return value ? 'yes' : 'no';
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
