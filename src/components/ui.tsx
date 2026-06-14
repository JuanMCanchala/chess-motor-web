'use client';

import React from 'react';
import { Icon, IconName } from './Icon';

// ── Primitivos de UI (estilo Lichess / En Croissant) ────────────────────────

type BtnVariant = 'primary' | 'ghost' | 'danger' | 'subtle';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 shadow-sm',
  ghost:   'bg-transparent text-fg border border-border hover:bg-hover',
  danger:  'bg-danger text-white hover:brightness-110 shadow-sm',
  subtle:  'bg-hover text-fg hover:brightness-110',
};

export function Button({
  variant = 'primary', icon, children, className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; icon?: IconName }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium
        transition-all duration-150 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none
        ${BTN[variant]} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} size={15} />}
      {children}
    </button>
  );
}

/** Botón cuadrado de icono (navegación, toolbar). */
export function IconButton({
  icon, active, size = 16, className = '', ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; active?: boolean; size?: number }) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg p-2 transition-colors
        ${active ? 'bg-accent text-white' : 'text-dim hover:bg-hover hover:text-fg'} ${className}`}
      {...props}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

export function Card({
  className = '', hover = false, children, ...props
}: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={`bg-card border border-border rounded-xl ${hover ? 'transition-colors hover:border-accent/50 cursor-pointer' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

/** Toggle segmentado tipo pill (Human/Engine, Time/Unlimited, etc.). */
export function Segmented<T extends string>({
  value, onChange, options, size = 'md', className = '',
}: {
  value: T; onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  size?: 'sm' | 'md'; className?: string;
}) {
  const pad = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm';
  return (
    <div className={`inline-flex bg-base border border-border rounded-lg p-0.5 ${className}`}>
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all ${pad}
            ${value === o.value ? 'bg-accent text-white shadow-sm' : 'text-dim hover:text-fg'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`bg-base border border-border text-fg rounded-lg px-3 py-2 text-sm outline-none
        focus:border-accent transition-colors placeholder:text-dim ${className}`}
      {...props}
    />
  );
}

export function Select({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`bg-base border border-border text-fg rounded-lg px-3 py-2 text-sm outline-none
        focus:border-accent transition-colors ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

/** Separador con etiqueta centrada (── Time Settings ──). */
export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="border-t border-border my-2" />;
  return (
    <div className="flex items-center gap-3 my-1 text-dim text-xs">
      <span className="flex-1 border-t border-dashed border-border" />
      {label}
      <span className="flex-1 border-t border-dashed border-border" />
    </div>
  );
}

/** Toggle on/off (switch). */
export function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${checked ? 'bg-accent' : 'bg-hover'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
