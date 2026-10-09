'use client';
// Uncontrolled input that saves on blur. `area` renders a textarea (for notes).
export default function Cell({ value, onCommit, type = 'text', className = '', list, area }: { value: string | number | null; onCommit: (v: string) => void; type?: string; className?: string; list?: string; area?: boolean }) {
  const common = {
    key: String(value), defaultValue: value ?? '',
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.target.value !== String(value ?? '') && onCommit(e.target.value),
    className: `bg-transparent border-b border-transparent hover:border-black/20 focus:border-[#00a0bf] outline-none min-h-9 w-full ${className}`,
  };
  return area ? <textarea {...common} rows={3} /> : <input {...common} type={type} list={list} step={type === 'number' ? '0.01' : undefined} />;
}
