import React, { useState, useEffect, useRef } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import Select from './Select';

interface DatePickerProps {
  value: string; // Format: YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  min?: string; // Format: YYYY-MM-DD
  max?: string; // Format: YYYY-MM-DD
  placeholder?: string;
  align?: 'left' | 'right' | 'auto';
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DatePicker({
  value,
  onChange,
  className = '',
  required = false,
  min,
  max,
  placeholder = 'Select date',
  align: propAlign = 'auto'
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [align, setAlign] = useState<'left' | 'right'>('left');
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // Automatically adjust calendar alignment when opened
  useEffect(() => {
    if (!isOpen) return;

    if (propAlign !== 'auto') {
      setAlign(propAlign);
      return;
    }

    const timer = setTimeout(() => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        
        // Traverse up to find the nearest scroll or modal container that could clip us
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
        if (spaceRight < 280 && rect.right > 280) {
          setAlign('right');
        } else {
          setAlign('left');
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [isOpen, propAlign]);

  // Synchronize view date when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  // Create range of years for dropdown (e.g. current year - 80 to current year + 20)
  const currentYearNum = new Date().getFullYear();
  const yearsRange = Array.from({ length: 101 }, (_, i) => currentYearNum - 80 + i);

  // Helper to format date for human display
  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const [y, m, d] = parts;
    const mIdx = parseInt(m, 10) - 1;
    const mName = MONTHS[mIdx]?.substring(0, 3) || m;
    return `${d} ${mName} ${y}`;
  };

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month + 1, 1));
  };

  const handleMonthChange = (m: number) => {
    setViewDate(new Date(year, m, 1));
  };

  const handleYearChange = (y: number) => {
    setViewDate(new Date(y, month, 1));
  };

  const handleDaySelect = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  // Generate calendar days grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay();

  const days: Array<{
    dayNum: number;
    dateStr: string;
    isCurrentMonth: boolean;
    isSelected: boolean;
    isDisabled: boolean;
  }> = [];

  // Previous month padding days
  const prevMonthDaysCount = new Date(year, month, 0).getDate();
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dNum = prevMonthDaysCount - i;
    const pMonth = month === 0 ? 11 : month - 1;
    const pYear = month === 0 ? year - 1 : year;
    const dStr = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
    days.push({
      dayNum: dNum,
      dateStr: dStr,
      isCurrentMonth: false,
      isSelected: false,
      isDisabled: true
    });
  }

  // Current month days
  for (let i = 1; i <= daysInMonth; i++) {
    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const isSelected = value === dStr;
    
    let isDisabled = false;
    if (min && dStr < min) isDisabled = true;
    if (max && dStr > max) isDisabled = true;

    days.push({
      dayNum: i,
      dateStr: dStr,
      isCurrentMonth: true,
      isSelected,
      isDisabled
    });
  }

  // Next month padding days to fill standard grid
  const totalSlots = days.length <= 35 ? 35 : 42;
  const nextMonthPaddingCount = totalSlots - days.length;
  for (let i = 1; i <= nextMonthPaddingCount; i++) {
    const nMonth = month === 11 ? 0 : month + 1;
    const nYear = month === 11 ? year + 1 : year;
    const dStr = `${nYear}-${String(nMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    days.push({
      dayNum: i,
      dateStr: dStr,
      isCurrentMonth: false,
      isSelected: false,
      isDisabled: true
    });
  }

  const isFullWidth = className.includes('w-full');

  return (
    <div ref={containerRef} className={`relative inline-block text-left font-sans ${isFullWidth ? 'w-full' : ''}`}>
      {/* Invisible backdrop to capture clicks when open */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[99] bg-transparent"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Styled Input Trigger */}
      <div className={`relative cursor-pointer ${isFullWidth ? 'w-full' : ''}`} onClick={() => setIsOpen(!isOpen)}>
        <input
          type="text"
          readOnly
          placeholder={placeholder}
          value={formatDateDisplay(value)}
          className={`cursor-pointer pr-8 ${className}`}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
          <CalendarIcon className="w-3.5 h-3.5" />
        </div>
      </div>

      {/* Hidden standard input for HTML5 form validation */}
      <input
        type="date"
        className="sr-only"
        tabIndex={-1}
        value={value || ''}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
      />

      {/* Calendar Dropdown Popover */}
      {isOpen && (
        <div className={`absolute mt-1.5 z-[100] w-[272px] bg-white border border-zinc-200 rounded-2xl shadow-xl p-3 animate-fade-in select-none ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {/* Header controls */}
          <div className="flex items-center justify-between gap-1 mb-2.5">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-800 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-1">
              <Select
                value={month}
                onChange={handleMonthChange}
                options={MONTHS.map((m, idx) => ({ value: idx, label: m.substring(0, 3) }))}
              />
              <Select
                value={year}
                onChange={handleYearChange}
                options={yearsRange.map((y) => ({ value: y, label: String(y) }))}
              />
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-800 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekdays */}
          <div className="grid grid-cols-7 gap-1 mb-1 text-center">
            {WEEKDAYS.map((day) => (
              <span key={day} className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wide">
                {day}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {days.map((d, idx) => {
              let dayStyles = 'text-xs py-1.5 rounded-lg font-semibold transition-all relative';
              if (d.isSelected) {
                dayStyles += ' bg-zinc-950 text-white font-black shadow-sm';
              } else if (d.isDisabled) {
                dayStyles += ' text-zinc-250 bg-zinc-50/20 cursor-not-allowed pointer-events-none opacity-40';
              } else if (d.isCurrentMonth) {
                dayStyles += ' text-zinc-900 hover:bg-zinc-100 cursor-pointer';
              } else {
                dayStyles += ' text-zinc-300 font-medium cursor-not-allowed pointer-events-none';
              }

              return (
                <button
                  key={`${d.dateStr}-${idx}`}
                  type="button"
                  disabled={d.isDisabled}
                  onClick={() => handleDaySelect(d.dateStr)}
                  className={dayStyles}
                >
                  {d.dayNum}
                </button>
              );
            })}
          </div>

          {/* Shortcuts Bottom Row */}
          <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-zinc-100 text-xs px-1">
            <button
              type="button"
              onClick={() => {
                const todayStr = new Date().toISOString().split('T')[0];
                let isTodayDisabled = false;
                if (min && todayStr < min) isTodayDisabled = true;
                if (max && todayStr > max) isTodayDisabled = true;
                if (!isTodayDisabled) {
                  onChange(todayStr);
                  setIsOpen(false);
                }
              }}
              className="text-zinc-900 font-extrabold hover:underline"
            >
              Today
            </button>
            {!required && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="text-rose-600 font-extrabold hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
