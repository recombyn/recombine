import { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { HiOutlineMagnifyingGlass } from 'react-icons/hi2';
import { Input, Tooltip } from '@/components/base';
import {
  filterIconCatalog,
  ICON_CATEGORIES,
  type IconCatalogItem,
  type IconCategory,
} from '@/components/editor/panels/iconCatalog';
import { addNodeToDocument, createImageNode } from '@/store/scene/sceneDocument';
import { iconToSvgDataUrl } from '@/components/editor/panels/iconToDataUrl';
import { cn } from '@/utils/classnames';
import { setDocument, setSelectedNodeIds } from '@/store/modules/editor';

const ICON_PLACE_SIZE = 48;

type CategoryFilter = IconCategory | 'all';

export default function ResourcesPanel() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const document = useSelector((state: any) => state.editor.document);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');

  const icons = useMemo(() => filterIconCatalog(query, category), [query, category]);

  const insertIcon = (item: IconCatalogItem) => {
    if (!document) return;
    const src = iconToSvgDataUrl(item.Icon, { size: 128, color: '#333333' });
    const pageW = Number(document.width) || 794;
    const pageH = Number(document.height) || 1123;
    const ox = Number(document.x) || 0;
    const oy = Number(document.y) || 0;
    const x = ox + (pageW - ICON_PLACE_SIZE) / 2;
    const y = oy + Math.min(160, pageH / 5);
    const { id, node } = createImageNode({
      x,
      y,
      width: ICON_PLACE_SIZE,
      height: ICON_PLACE_SIZE,
      src,
      name: item.label || item.id || 'Icon',
      assetKind: 'icon',
    });
    dispatch(setDocument(addNodeToDocument(document, id, node)));
    dispatch(setSelectedNodeIds([id]));
  };

  const filters: { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: t('editor.iconCatAll') },
    ...ICON_CATEGORIES.map((id) => ({
      id,
      label: t(`editor.iconCat.${id}`),
    })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-[var(--line)] px-2.5 py-2">
        <Input
          size="small"
          type="filled"
          allowClear
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery('')}
          placeholder={t('editor.searchIcons')}
          prefix={<HiOutlineMagnifyingGlass className="h-3.5 w-3.5 text-[var(--muted)]" />}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setCategory(f.id)}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] transition-colors',
                category === f.id
                  ? 'bg-[var(--ink)] text-[var(--surface)]'
                  : 'bg-[var(--accent-soft)] text-[var(--muted)] hover:text-[var(--ink)]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">{t('editor.insertIconHint')}</p>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {icons.length ? (
          <div className="grid grid-cols-4 gap-1">
            {icons.map((item) => {
              const Icon = item.Icon;
              return (
                <Tooltip key={item.id} title={item.label} placement="top">
                  <button
                    type="button"
                    onClick={() => insertIcon(item)}
                    className="flex aspect-square items-center justify-center rounded-md border border-transparent text-[var(--ink)] transition-colors hover:border-[var(--line)] hover:bg-[var(--accent-soft)]"
                    aria-label={item.label}
                  >
                    <Icon className="h-5 w-5" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        ) : (
          <p className="px-2 py-8 text-center text-[12px] text-[var(--muted)]">{t('editor.noIcons')}</p>
        )}
      </div>
    </div>
  );
}
