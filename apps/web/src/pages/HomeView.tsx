import { useRef, useState } from 'react';
import ImportFileDialog, {
  IMPORT_ACCEPT,
  type ImportFileKind,
} from '@/components/home/ImportFileDialog';
import HomeTopBar from '@/components/layout/HomeTopBar';
import { HomeSidebar, HomeTemplateList, useHomeNav } from '@/components/layout/HomeBody';
import { useHomeActions } from '@/pages/useHomeActions';

export default function HomeView() {
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { nav, setNav, query, importing, setImporting, importingName, setImportingName } =
    useHomeNav();
  const {
    handleCreate,
    handleAgentSubmit,
    handleOpenCase,
    handleImportJson,
    handleImportFile,
  } = useHomeActions(jsonInputRef, fileInputRef, setImporting, setImportingName, setImportOpen);

  const openFilePicker = (kind: ImportFileKind) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.accept = IMPORT_ACCEPT[kind];
    input.value = '';
    input.click();
  };

  return (
    <div className="relative flex h-full overflow-hidden bg-[var(--surface)]">
      <HomeSidebar
        nav={nav}
        setNav={setNav}
        importing={importing}
        onCreate={handleCreate}
      />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface)]">
        <HomeTopBar />
        <HomeTemplateList
          nav={nav}
          setNav={setNav}
          query={query}
          importing={importing}
          importingName={importingName}
          onCreate={handleCreate}
          onAgentSubmit={handleAgentSubmit}
          onOpenCase={handleOpenCase}
        />
      </div>
      <ImportFileDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onConfirm={openFilePicker}
      />
      <input
        ref={jsonInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportJson}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={IMPORT_ACCEPT.image}
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  );
}
