import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: string | number;
  label: string;
}

interface SelectProps {
  value: string | number;
  options: Option[];
  onChange: (value: any) => void;
  className?: string;
  dropdownClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

export default function Select({
  value,
  options,
  onChange,
  className = '',
  dropdownClassName = '',
  placeholder = 'Select option',
  disabled = false,
  required = false
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const containerRef = useRef<HTMLDivElement>(null);
  
  const selectedOption = options.find((opt) => opt.value === value);
  const isFullWidth = className.includes('w-full');

  // Automatically adjust dropdown alignment when opened to prevent container clipping
  useEffect(() => {
    if (isOpen && containerRef.current && !isFullWidth) {
      const rect = containerRef.current.getBoundingClientRect();
      let parent = containerRef.current.parentElement;
      let limitRight = window.innerWidth;
      
      while (parent) {
        const style = window.getComputedStyle(parent);
        const overflow = style.overflow + style.overflowX + style.overflowY;
        const isScrollOrModal = 
          overflow.includes('auto') || 
          overflow.includes('hidden') || 
          overflow.includes('scroll') ||
          parent.classList.contains('bg-white') ||
          parent.tagName === 'FORM';
        
        if (isScrollOrModal && parent.clientWidth > 0) {
          const parentRect = parent.getBoundingClientRect();
          if (parentRect.right < limitRight) {
            limitRight = parentRect.right;
          }
        }
        if (parent.tagName === 'BODY' || parent.tagName === 'HTML') {
          break;
        }
        parent = parent.parentElement;
      }
      
      const spaceRight = limitRight - rect.left;
      if (spaceRight < 160 && rect.right > 160) {
        setAlign('right');
      } else {
        setAlign('left');
      }
    }
  }, [isOpen, isFullWidth]);

  return (
    <div ref={containerRef} className={`relative inline-block text-left font-sans ${isFullWidth ? 'w-full' : ''}`}>
      {isOpen && !disabled && (
        <div
          className="fixed inset-0 z-[110] bg-transparent"
          onClick={() => setIsOpen(false)}
        />
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-1.5 text-xs font-semibold bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 text-zinc-800 hover:bg-zinc-50 transition-colors cursor-pointer outline-none disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
      </button>

      {/* Hidden input to support native HTML5 form validation */}
      <input
        type="text"
        className="sr-only"
        tabIndex={-1}
        value={value || ''}
        required={required}
        readOnly
      />

      {isOpen && !disabled && (
        <div className={`absolute top-full mt-1 z-[120] max-h-48 overflow-y-auto bg-white border border-zinc-200 rounded-xl shadow-lg py-1 animate-fade-in divide-y divide-zinc-50 ${isFullWidth ? 'left-0 w-full' : (align === 'right' ? 'right-0' : 'left-0')} ${dropdownClassName}`} style={{ minWidth: isFullWidth ? '100%' : '140px' }}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-50 transition-colors block ${
                opt.value === value
                  ? 'font-bold text-zinc-955 bg-zinc-100/50'
                  : 'text-zinc-600 font-medium'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
