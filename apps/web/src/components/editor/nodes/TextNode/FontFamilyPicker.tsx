import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from '@floating-ui/react';
import { HiOutlineChevronDown, HiOutlineMagnifyingGlass, HiOutlinePlus } from 'react-icons/hi2';
import {
  applyFontFamilySelection,
  getBaseFontFamily,
  getFontCatalogSync,
  getPreviewFontFamily,
  loadFontCatalog,
  type FontFamilyNode,
} from '@/store/scene/fontCatalog';
import Tooltip from '@/components/base/tooltip';
import { DropdownPanel, DropdownPanelItem } from '@/components/base';
import { cn } from '@/utils/classnames';
import { SEL_TOOL_BTN } from '@/components/editor/Canvas/selection/ToolbarValueSlider';

const FALLBACK_FONTS: FontFamilyNode[] = [
  { family: 'Alibaba PuHuiTi', displayName: 'Alibaba PuHuiTi', children: [] },
  { family: 'Inter', displayName: 'Inter', children: [] },
  { family: 'Microsoft YaHei', displayName: 'Microsoft YaHei', children: [] },
  { family: 'PingFang SC', displayName: 'PingFang SC', children: [] },
  { family: 'Noto Sans SC', displayName: 'Noto Sans SC', children: [] },
  { family: 'Arial', displayName: 'Arial', children: [] },
  { family: 'Georgia', displayName: 'Georgia', children: [] },
];

type Category = 'all' | 'cjk' | 'latin';

const CATEGORY_LABEL: Record<Category, string> = {
  all: '全部字体',
  cjk: '中文字体',
  latin: '英文字体',
};

function isCjkFamily(font: FontFamilyNode) {
  const s = `${font.family} ${font.displayName}`;
  return /[\u4e00-\u9fff]|YaHei|PuHui|PingFang|Noto Sans SC|SimSun|SimHei|KaiTi|宋|黑|楷|普惠/i.test(
    s
  );
}

type Props = {
  value: string;
  onChange: (next: { fontFamily: string; fontWeight: string }) => void;
  className?: string;
};

/**
 * Font picker panel (fig.2): search · category · preview list in each face.
 */
export default function FontFamilyPicker({ value, onChange, className }: Props): ReactNode {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<FontFamilyNode[]>(() => getFontCatalogSync());
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [catOpen, setCatOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadFontCatalog().then((list) => {
      if (!cancelled) setCatalog(list.length ? list : FALLBACK_FONTS);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fonts = catalog.length ? catalog : FALLBACK_FONTS;
  const base = getBaseFontFamily(value, fonts);
  const triggerLabel =
    fonts.find((f) => f.family === base)?.displayName || base || '字体';

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return fonts.filter((f) => {
      if (category === 'cjk' && !isCjkFamily(f)) return false;
      if (category === 'latin' && isCjkFamily(f)) return false;
      if (!q) return true;
      return (
        f.family.toLowerCase().includes(q) ||
        f.displayName.toLowerCase().includes(q)
      );
    });
  }, [fonts, query, category]);

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      setOpen(next);
      if (!next) {
        setQuery('');
        setCatOpen(false);
      }
    },
    placement: 'bottom-start',
    strategy: 'fixed',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
  });
  const dismiss = useDismiss(context);
  const { getReferenceProps, getFloatingProps } = useInteractions([dismiss]);

  const pick = (font: FontFamilyNode) => {
    onChange(applyFontFamilySelection(font.family, fonts));
    setOpen(false);
    setQuery('');
    setCatOpen(false);
  };

  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps({
          onClick: () => setOpen((v) => !v),
        })}
        className={cn(SEL_TOOL_BTN, 'max-w-[9rem]', open && 'bg-[var(--accent-soft)]', className)}
        aria-label={triggerLabel}
      >
        <span className="truncate" style={{ fontFamily: getPreviewFontFamily(
          fonts.find((f) => f.family === base) || { family: base, displayName: base, children: [] }
        ) }}>
          {triggerLabel}
        </span>
        <HiOutlineChevronDown
          className={cn('h-3 w-3 shrink-0 text-[var(--muted)] transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[80] w-[240px] overflow-hidden rounded-[4px] bg-[var(--surface)] shadow-[0_12px_40px_rgba(15,23,42,0.18)] ring-1 ring-[var(--line)]"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="space-y-2 px-2.5 pb-2 pt-2.5">
              <label className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--canvas)] px-2.5 text-[var(--muted)]">
                <HiOutlineMagnifyingGlass className="h-3.5 w-3.5 shrink-0" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="搜索字体"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
                />
              </label>

              <div className="relative flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[12px] text-[var(--ink)] hover:bg-[var(--accent-soft)]"
                  onClick={() => setCatOpen((v) => !v)}
                >
                  {CATEGORY_LABEL[category]}
                  <HiOutlineChevronDown
                    className={cn(
                      'h-3 w-3 text-[var(--muted)] transition-transform',
                      catOpen && 'rotate-180'
                    )}
                  />
                </button>
                <Tooltip title="添加字体" placement="top">
                  <button
                    type="button"
                    aria-label="添加字体"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
                    onClick={() => {
                      /* Upload fonts — hook up later */
                    }}
                  >
                    <span className="relative inline-flex text-[13px] font-semibold leading-none">
                      T
                      <HiOutlinePlus className="absolute -right-2 -top-1.5 h-2.5 w-2.5" />
                    </span>
                  </button>
                </Tooltip>

                {catOpen ? (
                  <DropdownPanel className="absolute left-0 top-[calc(100%+4px)] z-10 min-w-[7.5rem]">
                    {(Object.keys(CATEGORY_LABEL) as Category[]).map((key) => (
                      <DropdownPanelItem
                        key={key}
                        selected={category === key}
                        onClick={() => {
                          setCategory(key);
                          setCatOpen(false);
                        }}
                      >
                        {CATEGORY_LABEL[key]}
                      </DropdownPanelItem>
                    ))}
                  </DropdownPanel>
                ) : null}
              </div>
            </div>

            <div className="mx-2.5 border-t border-[var(--line)]" />

            <div className="max-h-[280px] overflow-y-auto px-1 py-0.5">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-[12px] text-[var(--muted)]">无匹配字体</p>
              ) : (
                filtered.map((font) => {
                  const selected = font.family === base;
                  const preview = getPreviewFontFamily(font);
                  return (
                    <DropdownPanelItem
                      key={font.family}
                      selected={selected}
                      onClick={() => pick(font)}
                      className="text-[14px]"
                      style={{ fontFamily: `'${preview}', ${preview}, sans-serif` }}
                    >
                      {font.displayName || font.family}
                    </DropdownPanelItem>
                  );
                })
              )}
            </div>
          </div>
        </FloatingPortal>
      ) : null}
    </>
  );
}
