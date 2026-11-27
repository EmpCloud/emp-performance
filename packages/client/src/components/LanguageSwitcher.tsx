import { useState, useRef, useEffect, useId, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const LANGUAGES = [
  { code: "en", label: "English", flag: "EN" },
  { code: "hi", label: "हिन्दी", flag: "HI" },
  { code: "es", label: "Español", flag: "ES" },
  { code: "fr", label: "Français", flag: "FR" },
  { code: "de", label: "Deutsch", flag: "DE" },
  { code: "ar", label: "العربية", flag: "AR" },
  { code: "pt", label: "Português", flag: "PT" },
  { code: "ja", label: "日本語", flag: "JA" },
  { code: "zh", label: "中文", flag: "ZH" },
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();

  const selectedIndex = Math.max(0, LANGUAGES.findIndex((language) => language.code === i18n.language));
  const currentLang = LANGUAGES[selectedIndex];

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  function openMenu(index: number) {
    setActiveIndex(index);
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const handleChange = (code: string) => {
    void i18n.changeLanguage(code);
    closeMenu();
  };

  function handleMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    const nextIndex = event.key === "ArrowDown" ? (activeIndex + 1) % LANGUAGES.length
      : event.key === "ArrowUp" ? (activeIndex + LANGUAGES.length - 1) % LANGUAGES.length
        : event.key === "Home" ? 0
          : event.key === "End" ? LANGUAGES.length - 1
            : null;
    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
    }
    // Enter/Space activate the focused button natively. Tab keeps its normal
    // page-navigation behavior; the blur handler closes the menu afterward.
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        ref={triggerRef}
        type="button"
        onPointerDown={(event) => {
          // Keep the option focused until click toggles the menu; otherwise
          // blur would close it first and the subsequent click would reopen it.
          if (open) event.preventDefault();
        }}
        onClick={() => open ? closeMenu() : openMenu(selectedIndex)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowDown" ? 0 : LANGUAGES.length - 1);
          }
        }}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        title={t("nav.changeLanguage")}
        aria-label={t("nav.changeLanguage")}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
      >
        <Globe className="h-4 w-4" aria-hidden="true" />
        <span className="hidden text-xs font-medium sm:inline">{currentLang.flag}</span>
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t("nav.changeLanguage")}
          onKeyDown={handleMenuKeyDown}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
          }}
          className="fixed inset-x-4 top-16 z-50 max-h-[calc(100dvh-5rem)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800 sm:absolute sm:inset-x-auto sm:end-0 sm:top-full sm:mt-1 sm:w-44"
        >
          {LANGUAGES.map((lang, index) => (
            <button
              key={lang.code}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="menuitemradio"
              aria-checked={currentLang.code === lang.code}
              tabIndex={index === activeIndex ? 0 : -1}
              lang={lang.code}
              onFocus={() => setActiveIndex(index)}
              onClick={() => handleChange(lang.code)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-start text-sm transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-gray-700 ${
                i18n.language === lang.code
                  ? "bg-brand-50 font-medium text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              <span aria-hidden="true" className="w-6 text-center text-xs font-bold text-gray-400">{lang.flag}</span>
              {lang.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
