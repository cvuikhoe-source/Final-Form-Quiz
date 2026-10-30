import { useMemo, useState } from 'react';
import type { ExamFolder, FolderColor } from '@/types';
import { useLanguage } from '@/context/LanguageContext';
import { FOLDER_COLOR_OPTIONS } from '@/lib/folderTree';
import { X, FolderPlus, Pencil, FolderInput, AlertTriangle } from 'lucide-react';

const modalShell =
  'fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in md:items-center';
const modalBox =
  'max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 animate-slide-up safe-bottom md:rounded-2xl md:animate-fade-in';
const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition-all focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const labelCls = 'mb-1.5 block text-sm font-medium text-slate-700';

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-bold text-slate-800">{title}</h3>
      <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
        <X size={20} />
      </button>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: FolderColor | null; onChange: (c: FolderColor) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FOLDER_COLOR_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
            value === opt.key ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className={`h-3 w-3 rounded-full ${opt.dot}`} />
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface CreateFolderDialogProps {
  parentName: string | null;
  onClose: () => void;
  onCreate: (name: string, description: string, color: FolderColor) => void;
}

export function CreateFolderDialog({ parentName, onClose, onCreate }: CreateFolderDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<FolderColor>('blue');

  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), description.trim(), color);
  };

  return (
    <div className={modalShell} onClick={onClose}>
      <div className={modalBox} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title={t('folder.createTitle')} onClose={onClose} />
        <div className="space-y-4">
          {parentName && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {t('folder.createdInside', { name: parentName })}
            </p>
          )}
          <div>
            <label className={labelCls}>{t('folder.nameLabel')}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('folder.namePlaceholder')}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t('folder.descLabel')}</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('folder.descPlaceholder')}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t('folder.colorLabel')}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {t('common.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={!name.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all disabled:opacity-40 hover:bg-blue-700"
            >
              <FolderPlus size={16} />
              {t('exam.createFolder')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface RenameFolderDialogProps {
  folder: ExamFolder;
  onClose: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: FolderColor) => void;
}

export function RenameFolderDialog({ folder, onClose, onRename, onRecolor }: RenameFolderDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(folder.name);
  const [color, setColor] = useState<FolderColor | null>(folder.color);

  const submit = () => {
    if (!name.trim()) return;
    onRename(name.trim());
    if (color && color !== folder.color) onRecolor(color);
  };

  return (
    <div className={modalShell} onClick={onClose}>
      <div className={modalBox} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title={t('folder.renameTitle')} onClose={onClose} />
        <div className="space-y-4">
          <div>
            <label className={labelCls}>{t('folder.nameLabelPlain')}</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls}>{t('folder.colorLabel')}</label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
              {t('common.cancel')}
            </button>
            <button
              onClick={submit}
              disabled={!name.trim()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-40 hover:bg-blue-700"
            >
              <Pencil size={16} />
              {t('common.saveChanges')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MoveDialogProps {
  title: string;
  itemLabel: string;
  folders: ExamFolder[];
  currentParentId: string | null;
  disabledIds: string[];
  onMove: (targetFolderId: string | null) => void;
  onClose: () => void;
}

export function MoveDialog({ title, itemLabel, folders, currentParentId, disabledIds, onMove, onClose }: MoveDialogProps) {
  const { t } = useLanguage();
  const [selected, setSelected] = useState<string | null>(currentParentId);
  const disabled = useMemo(() => new Set(disabledIds), [disabledIds]);
  const byParent = useMemo(() => {
    const map = new Map<string | null, ExamFolder[]>();
    folders.forEach((f) => {
      const list = map.get(f.parentId) ?? [];
      list.push(f);
      map.set(f.parentId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name, 'vi')));
    return map;
  }, [folders]);

  const renderLevel = (parentId: string | null, depth: number): React.ReactNode => {
    const children = byParent.get(parentId) ?? [];
    if (children.length === 0 && depth === 0) {
      return <p className="py-4 text-center text-xs text-slate-400">{t('folder.emptyTree')}</p>;
    }
    return children.map((f) => {
      const isDisabled = disabled.has(f.id);
      return (
        <div key={f.id}>
          <button
            disabled={isDisabled}
            onClick={() => setSelected(f.id)}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
              selected === f.id
                ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200'
                : isDisabled
                  ? 'cursor-not-allowed text-slate-300'
                  : 'text-slate-700 hover:bg-slate-50'
            }`}
            style={{ paddingLeft: `${depth * 18 + 12}px` }}
          >
            <span className="text-base leading-none">📁</span>
            <span className="flex-1 truncate">{f.name}</span>
            {isDisabled && <span className="text-[10px] text-slate-300">{t('folder.notSelectable')}</span>}
          </button>
          {byParent.has(f.id) && renderLevel(f.id, depth + 1)}
        </div>
      );
    });
  };

  return (
    <div className={modalShell} onClick={onClose}>
      <div className={modalBox} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title={title} onClose={onClose} />
        <p className="mb-3 text-xs text-slate-500">
          {t('folder.moveTo', { item: itemLabel })}
        </p>
        <div className="mb-4 max-h-72 space-y-0.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
          <button
            onClick={() => setSelected(null)}
            className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
              selected === null
                ? 'bg-blue-50 font-semibold text-blue-700 ring-1 ring-blue-200'
                : 'text-slate-700 hover:bg-slate-50'
            }`}
          >
            <span className="text-base leading-none">🏠</span>
            {t('folder.homeOption')}
          </button>
          {renderLevel(null, 0)}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onMove(selected)}
            disabled={selected === currentParentId}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-40 hover:bg-blue-700"
          >
            <FolderInput size={16} />
            {t('exam.menuMove')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface DeleteFolderDialogProps {
  folder: ExamFolder;
  childFolderCount: number;
  examCount: number;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function DeleteFolderDialog({ folder, childFolderCount, examCount, onArchive, onDelete, onClose }: DeleteFolderDialogProps) {
  const { t } = useLanguage();
  const isEmpty = childFolderCount === 0 && examCount === 0;
  return (
    <div className={modalShell} onClick={onClose}>
      <div className={modalBox} onClick={(e) => e.stopPropagation()}>
        <ModalHeader title={isEmpty ? t('folder.deleteTitle') : t('folder.hasContentTitle')} onClose={onClose} />
        {isEmpty ? (
          <p className="mb-4 text-sm text-slate-600">
            {t('folder.deleteEmptyBody', { name: folder.name })}
          </p>
        ) : (
          <>
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" />
              <p className="text-sm text-amber-800">
                {t('folder.contentWarning', { folders: childFolderCount, exams: examCount })}
              </p>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              {t('folder.deleteAdvice')}
            </p>
          </>
        )}
        <div className="flex flex-col gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => { onArchive(); onClose(); }}
            className="rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            {t('folder.archiveBtn')}
          </button>
          {!isEmpty && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              {t('folder.deleteExamsHome')}
            </button>
          )}
          {isEmpty && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              {t('folder.deleteBtn')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
