// Defense in depth; not a general PII detector. Raw input is restricted to author/staff.
export function redact(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[contact removed]')
    .replace(/(?:\+?\d[\d ()-]{7,}\d)/g, (value) =>
      /^\d{4}-\d{2}-\d{2}/.test(value) || value.replace(/\D/g, '').length < 10
        ? value
        : '[contact removed]',
    );
}
