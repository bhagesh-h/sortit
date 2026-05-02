/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  File,
  Search,
  Upload,
  Tag,
  Filter,
  Info,
  CheckCircle2,
  Plus,
  Trash2,
  Play,
  List,
  Copy,
  ArrowRight,
  MoreVertical,
  Layers,
  X,
  Settings as SettingsIcon,
  LayoutGrid,
  Cpu,
  Zap,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Database,
  Github,
  Linkedin,
  Eye,
  Folder
} from 'lucide-react';
import { extractMetadata, extractMetadataBatch, AIProvider, Granularity } from './lib/aiService';

// --- Types ---
interface FileRecord {
  id: string;
  filename: string;
  fullPath?: string; // Original source path
  organizedPath?: string; // Path where it was copied to
  title: string;
  size: number;
  type: string;
  createdAt: string;
  aiMetadata: {
    extractedTitle: string;
    summary: string;
    keywords: string[];
    features?: string[];
  };
  tags: string[];
  categoryId: string;
  virtualPath: string;
}

interface PathInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  onAdd?: () => void;
  onRemove?: () => void;
  isLast?: boolean;
  isOnly?: boolean;
  type: 'source' | 'target';
  index?: number;
  className?: string;
  suggestions: string[];
  showSuggestions: { type: 'source' | 'target', index?: number } | null;
  setShowSuggestions: (val: { type: 'source' | 'target', index?: number } | null) => void;
  fetchSuggestions: (path: string) => void;
  id?: string;
  separator: string;
  key?: React.Key;
}

const PathInput = ({
  value,
  onChange,
  placeholder,
  onAdd,
  onRemove,
  isLast,
  isOnly,
  type,
  index,
  className = "",
  suggestions,
  showSuggestions,
  setShowSuggestions,
  fetchSuggestions,
  id,
  separator
}: PathInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`relative flex-1 ${className}`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={id}
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              fetchSuggestions(e.target.value);
              setShowSuggestions({ type, index });
            }}
            onFocus={() => {
              fetchSuggestions(value || separator);
              setShowSuggestions({ type, index });
            }}
            onBlur={() => {
              // Delay hiding results to allow clicks
              setTimeout(() => setShowSuggestions(null), 200);
            }}
            placeholder={placeholder}
            className="w-full bg-transparent border-none outline-none focus:ring-0 transition-all font-sans text-[10px] font-bold text-primary p-0 placeholder:text-primary/60"
          />
          {showSuggestions?.type === type && showSuggestions?.index === index && suggestions.length > 0 && (
            <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto w-max min-w-full scrollbar-hide">
              {/* Option to select current if it's not root */}
              {value && value !== '/' && value !== separator && (
                <div
                  onClick={() => {
                    setShowSuggestions(null);
                  }}
                  className="px-4 py-2 text-[10px] font-bold text-accent bg-accent/5 hover:bg-accent/10 cursor-pointer border-b border-border/50 sticky top-0 z-10"
                >
                  SELECT CURRENT: {value}
                </div>
              )}
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange(s);
                    fetchSuggestions(s);
                    // Keep it open
                    setShowSuggestions({ type, index });
                  }}
                  className="px-4 py-2 text-xs hover:bg-accent/10 cursor-pointer border-b border-border/50 last:border-0 truncate flex items-center gap-2"
                >
                  <Folder size={16} className="text-accent flex-shrink-0" />
                  <span className="font-sans whitespace-nowrap text-sm font-bold text-primary">{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        {onRemove && !isOnly && (
          <button
            onClick={onRemove}
            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={18} />
          </button>
        )}
        {onAdd && isLast && (
          <button
            onClick={onAdd}
            className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
          >
            <Plus size={18} />
          </button>
        )}
      </div>
    </div>
  );
};

const TreeView = ({ tree, onRenameNode, onMoveNode }: {
  tree: any,
  onRenameNode?: (path: string, newName: string) => void,
  onMoveNode?: (path: string, newParent: string) => void
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'Root': true });

  const toggle = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNode = (node: any, path: string = '', depth: number = 0) => {
    const isFolder = node.children;
    const currentPath = path === '' ? node.name : `${path}/${node.name}`;
    const isExpanded = expanded[currentPath];

    return (
      <div
        key={currentPath}
        draggable={node.name !== 'Root'}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('type', isFolder ? 'folder' : 'file');
          e.dataTransfer.setData('sourcePath', currentPath);
        }}
        onDragOver={(e) => {
          if (isFolder) {
            e.preventDefault();
            e.currentTarget.classList.add('bg-accent/10');
          }
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove('bg-accent/10');
        }}
        onDrop={(e) => {
          if (isFolder && onMoveNode) {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('bg-accent/10');
            const type = e.dataTransfer.getData('type');
            const sourcePath = e.dataTransfer.getData('sourcePath');

            // For simple implementation, we just move the source to this current path as parent
            // In Sort Preview, paths start with Root/
            const targetParentPath = currentPath === 'Root' ? '/' : '/' + currentPath.replace('Root/', '');
            onMoveNode(sourcePath, targetParentPath);
          }
        }}
      >
        <div
          onClick={() => isFolder && toggle(currentPath)}
          className={`group flex items-center gap-3 py-2 px-4 rounded-xl hover:bg-black/5 cursor-pointer text-sm transition-all ${isFolder ? 'font-black text-primary' : 'text-slate-600 font-bold'}`}
          style={{ paddingLeft: `${depth * 20 + 16}px` }}
        >
          {isFolder ? (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-4 flex items-center justify-center">
                {isExpanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
              </div>
              <Folder size={18} className="text-accent fill-accent/10" />
            </div>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-4" /> {/* Spacer for chevron */}
              <File size={16} className="text-slate-400" />
            </div>
          )}
          <span
            className="truncate flex-1"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (onRenameNode && node.name !== 'Root') {
                const n = prompt("Rename in preview:", node.name);
                if (n) onRenameNode(currentPath, n);
              }
            }}
          >
            {node.name}
          </span>

          {!isFolder && <span className="text-[10px] text-slate-300 ml-auto whitespace-nowrap font-mono">{node.size}</span>}
        </div>

        {isFolder && isExpanded && (
          <div className="">
            {Object.values(node.children).map((child: any) => renderNode(child, currentPath, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return <div className="space-y-0.5">{renderNode(tree)}</div>;
};
const SidebarTree = ({
  tree,
  selectedFolder,
  onSelectFolder,
  onRenameFolder,
  onMoveFolder,
  onMoveFiles,
  isCollapsed
}: {
  tree: any,
  selectedFolder: string,
  onSelectFolder: (path: string) => void,
  onRenameFolder: (path: string, newName: string) => void,
  onMoveFolder: (path: string, newParent: string) => void,
  onMoveFiles: (ids: string[], newPath: string) => void,
  isCollapsed: boolean
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'Root': true });

  const toggle = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderNode = (node: any, path: string = '', depth: number = 0) => {
    const currentPath = path === '' ? node.name : `${path}/${node.name}`;
    const displayPath = currentPath === 'Root' ? 'All' : currentPath.replace('Root/', '');
    const isExpanded = expanded[currentPath];
    const isSelected = selectedFolder === displayPath;
    const hasChildren = node.children && Object.keys(node.children).length > 0;

    return (
      <div
        key={currentPath}
        draggable={node.name !== 'Root'}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData('type', 'folder');
          e.dataTransfer.setData('sourcePath', displayPath);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add('bg-accent/10');
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove('bg-accent/10');
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.classList.remove('bg-accent/10');
          const type = e.dataTransfer.getData('type');
          const sourceId = e.dataTransfer.getData('sourceId');
          const sourcePath = e.dataTransfer.getData('sourcePath');

          if (type === 'file' && sourceId) {
            onMoveFiles([sourceId], displayPath);
          } else if (type === 'folder' && sourcePath && sourcePath !== displayPath) {
            onMoveFolder(sourcePath, displayPath);
          }
        }}
      >
        <div
          onClick={() => onSelectFolder(displayPath)}
          className={`flex items-center gap-3 rounded-xl cursor-pointer transition-all ${node.name === 'Root'
              ? `px-4 py-3 text-sm ${isSelected ? 'bg-gray-200/50 font-black text-primary' : 'text-gray-700 hover:bg-gray-200/50 font-bold'}`
              : `py-1.5 px-3 text-xs ${isSelected ? 'font-black text-primary' : 'text-gray-700 hover:bg-black/5'}`
            }`}
          style={node.name !== 'Root' && !isCollapsed ? { paddingLeft: `${depth * 10 + 12}px` } : (isCollapsed ? { paddingLeft: '12px', justifyContent: 'center' } : {})}
        >
          {node.name !== 'Root' && !isCollapsed && (
            hasChildren ? (
              <div onClick={(e) => toggle(currentPath, e)} className="p-0.5 hover:bg-black/5 rounded flex-shrink-0">
                {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
              </div>
            ) : (
              <div className="w-[14px] flex-shrink-0" />
            )
          )}
          <Folder size={node.name === 'Root' ? 18 : 16} className={`flex-shrink-0 ${isSelected ? 'text-primary' : 'text-gray-400'}`} />
          {!isCollapsed && (
            <span
              className="truncate flex-1"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (node.name !== 'Root') {
                  const n = prompt("Rename folder:", node.name);
                  if (n) onRenameFolder(displayPath, n);
                }
              }}
            >
              {node.name === 'Root' ? 'All Files' : node.name}
            </span>
          )}
        </div>

        {hasChildren && isExpanded && !isCollapsed && (
          <div className="">
            {Object.values(node.children).map((child: any) => renderNode(child, currentPath, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {Object.values(tree.children).map((child: any) => renderNode(child, 'Root', 0))}
    </div>
  );
};

// --- Components ---

const Button = ({ children, onClick, variant = 'primary', size = 'md', className = '', disabled = false }: any) => {
  const base = "inline-flex items-center justify-center font-medium transition-colors rounded-lg disabled:opacity-50";
  const variants: any = {
    primary: "bg-primary text-white hover:bg-black",
    secondary: "bg-white text-primary border border-border hover:bg-panel",
    accent: "bg-accent text-white hover:opacity-90",
    ghost: "bg-transparent text-primary hover:bg-panel hover:text-black",
    danger: "bg-red-500 text-white hover:bg-red-600"
  };
  const sizes: any = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
};

export default function App() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [dbPath, setDbPath] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState('All');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [sourcePaths, setSourcePaths] = useState<string[]>(['']);
  const [targetPath, setTargetPath] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<{ type: 'source' | 'target', index?: number } | null>(null);

  const fetchSuggestions = async (path: string) => {
    try {
      const res = await fetch(`/api/local/list-dirs?basePath=${encodeURIComponent(path)}`);
      const data = await res.json();
      setSuggestions(data);
    } catch (err) {
      setSuggestions([]);
    }
  };

  // PathInput moved outside

  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [aiProvider, setAiProvider] = useState<AIProvider>('google');
  const [granularity, setGranularity] = useState<Granularity>('fine');
  const [apiKeys, setApiKeys] = useState<Record<string, any>>({
    openai: '',
    anthropic: '',
    openrouter: '',
    custom: { url: '', key: '' }
  });
  const [aiModel, setAiModel] = useState<string>('gemini-3-flash-preview');
  const [previewFiles, setPreviewFiles] = useState<FileRecord[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [previewTree, setPreviewTree] = useState<any>(null);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [aiProgress, setAiProgress] = useState({ current: 0, total: 0 });
  const [isSidebarTreeVisible, setIsSidebarTreeVisible] = useState(true);
  const [batchSize, setBatchSize] = useState(() => Number(localStorage.getItem('sortit_batch_size')) || 100);
  const [concurrency, setConcurrency] = useState(() => Number(localStorage.getItem('sortit_concurrency')) || 6);
  const [sysConfig, setSysConfig] = useState<{ platform: string, separator: string, homeDir: string }>({
    platform: 'linux',
    separator: '/',
    homeDir: '/'
  });

  // Sync Data with local Express API
  useEffect(() => {
    fetchFiles();
    fetch('/api/storage-info')
      .then(res => res.json())
      .then(data => setDbPath(data.path));

    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setSysConfig(data);
        // Default first source path to home if empty
        setSourcePaths(prev => prev.length === 1 && prev[0] === '' ? [data.homeDir] : prev);
      });
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      setFiles(data);
    } catch (err) {
      console.error("Fetch Files Error:", err);
      setNotification({ message: "Failed to load files from local DB", type: 'error' });
    }
  };

  const saveFiles = async (updatedFiles: FileRecord[]) => {
    try {
      await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: updatedFiles })
      });
      setFiles(updatedFiles);
    } catch (err) {
      console.error("Save Files Error:", err);
      setNotification({ message: "Failed to save files to local DB", type: 'error' });
    }
  };
  const [isSorted, setIsSorted] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Auto-hide notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const saveSettings = (newKeys: any, newGran: Granularity, newModel: string) => {
    setApiKeys(newKeys);
    setGranularity(newGran);
    setAiModel(newModel);
    // For now we persist configuration in memory/localStorage or we could add a settings endpoint
    localStorage.setItem('sortit_settings', JSON.stringify({ apiKeys: newKeys, granularity: newGran, aiModel: newModel }));
    setNotification({ message: "Settings saved locally", type: 'success' });
  };

  useEffect(() => {
    const saved = localStorage.getItem('sortit_settings');
    if (saved) {
      const { apiKeys, granularity, aiModel } = JSON.parse(saved);
      if (apiKeys) setApiKeys(apiKeys);
      if (granularity) setGranularity(granularity);
      if (aiModel) setAiModel(aiModel);
    }
  }, []);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = error => reject(error);
    });
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    return `${dd}_${mm}_${yyyy}`;
  };


  const generatePreview = () => {
    const baseFiles = Array.isArray(files) ? files : [];

    // Process the list to ensure everything has a proposed path if not already provided
    const previewList = baseFiles.map(file => {
      // If it already has a non-Inbox path, we keep it as is for the preview
      if (file.virtualPath && file.virtualPath !== '/Inbox') return file;

      const ext = file.filename.split('.').pop()?.toLowerCase() || 'other';
      const fileDate = file.createdAt ? new Date(file.createdAt) : new Date();
      const dateStr = formatDate(fileDate.toISOString());

      // Robustly strip extension from title for folder naming
      const rawTitle = file.aiMetadata?.extractedTitle || file.filename;
      const safeTitle = rawTitle.includes('.') ? rawTitle.split('.').slice(0, -1).join('.') : rawTitle;
      const folderTitle = (safeTitle || rawTitle).replace(/[\s/\\?%*:|"<>]+/g, '_').slice(0, 50);

      return {
        ...file,
        virtualPath: `/${ext}/${dateStr}/${folderTitle}`
      };
    });

    const root: any = { name: 'Root', children: {} };
    previewList.forEach(file => {
      const parts = (file.virtualPath || '/').split('/').filter(Boolean);
      let current = root;
      parts.forEach(part => {
        if (!current.children[part]) {
          current.children[part] = { name: part, children: {} };
        }
        current = current.children[part];
      });
      current.children[file.filename] = { name: file.filename, size: `${(file.size / 1024).toFixed(1)} KB` };
    });

    setPreviewFiles(previewList);
    setPreviewTree(root);
  };

  const handleRenamePreviewNode = (currentPath: string, newName: string) => {
    const pathParts = currentPath.replace('Root/', '').split('/');
    const nodeName = pathParts[pathParts.length - 1];

    const updated = previewFiles.map(f => {
      if (f.filename === nodeName && f.virtualPath === '/' + pathParts.slice(0, -1).join('/')) {
        return { ...f, filename: newName };
      }

      const oldFolderPath = '/' + pathParts.join('/');
      const newPathParts = [...pathParts];
      newPathParts[newPathParts.length - 1] = newName;
      const newFolderPath = '/' + newPathParts.join('/');

      if (f.virtualPath === oldFolderPath) return { ...f, virtualPath: newFolderPath };
      if (f.virtualPath.startsWith(oldFolderPath + '/')) return { ...f, virtualPath: f.virtualPath.replace(oldFolderPath, newFolderPath) };

      return f;
    });

    setPreviewFiles(updated);
  };

  const handleMovePreviewNode = (currentPath: string, newParent: string) => {
    const pathParts = currentPath.replace('Root/', '').split('/');
    const nodeName = pathParts.pop() || '';
    const oldFolderPath = '/' + pathParts.join('/');
    const cleanParent = newParent === '/' ? '' : (newParent.startsWith('/') ? newParent : '/' + newParent);

    const updated = previewFiles.map(f => {
      const fullOldPath = (oldFolderPath === '/' ? '' : oldFolderPath) + '/' + nodeName;
      const fullNewPath = cleanParent + '/' + nodeName;

      if (f.virtualPath === fullOldPath) return { ...f, virtualPath: fullNewPath };
      if (f.virtualPath.startsWith(fullOldPath + '/')) return { ...f, virtualPath: f.virtualPath.replace(fullOldPath, fullNewPath) };
      return f;
    });

    setPreviewFiles(updated);
  };

  // Re-calculate tree when previewFiles updates
  useEffect(() => {
    if (previewFiles.length > 0) {
      const root: any = { name: 'Root', children: {} };
      previewFiles.forEach(file => {
        const parts = file.virtualPath.split('/').filter(Boolean);
        let current = root;
        parts.forEach(part => {
          if (!current.children[part]) {
            current.children[part] = { name: part, children: {} };
          }
          current = current.children[part];
        });
        current.children[file.filename] = { name: file.filename, size: (file.size / 1024).toFixed(1) + ' KB' };
      });
      setPreviewTree(root);
    }
  }, [previewFiles]);

  // Handled via handleScanDirectory now
  /*
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    ...
  };
  */

  const runAISort = async () => {
    if (files.length === 0) return;

    // Sort strictly targeting Inbox files or files that clearly haven't been processed
    const unsortedFiles = files.filter(f => {
      const isInInbox = f.virtualPath === '/Inbox';
      const isPending = !f.aiMetadata || f.aiMetadata.summary === "Pending AI Analysis...";
      return isInInbox || (isPending && !f.virtualPath);
    });

    if (unsortedFiles.length === 0) {
      setNotification({ message: "No new files in Inbox to sort!", type: 'success' });
      return;
    }

    setIsAIProcessing(true);
    setAiProgress({ current: 0, total: unsortedFiles.length });

    const chunks = [];
    for (let i = 0; i < unsortedFiles.length; i += batchSize) {
      chunks.push(unsortedFiles.slice(i, i + batchSize));
    }

    try {
      const newlySortedFiles: FileRecord[] = [...files];

      const processChunk = async (chunk: FileRecord[]) => {
        const metadataBatch = await extractMetadataBatch(
          chunk.map(f => ({ filename: f.filename, type: f.type })),
          granularity,
          apiKeys,
          aiModel
        );

        metadataBatch.forEach((meta, idx) => {
          const file = chunk[idx];
          if (!file) return;
          const ext = file.filename.split('.').pop()?.toLowerCase() || 'other';
          const fileDate = file.createdAt ? new Date(file.createdAt) : new Date();
          const dateStr = formatDate(fileDate.toISOString());

          // Robustly strip extension from title for folder naming
          const rawTitle = meta.extractedTitle || file.filename;
          const safeTitle = rawTitle.includes('.') ? rawTitle.split('.').slice(0, -1).join('.') : rawTitle;
          const folderTitle = (safeTitle || rawTitle).replace(/[\s/\\?%*:|"<>]+/g, '_').slice(0, 50);
          // Create an organized path: Category / AI-Generated Folder Name
          const category = (meta.suggestedCategory || ext).toLowerCase().replace(/[^a-z0-9]/g, '_');
          const folderSlug = safeTitle.replace(/[\s/\\?%*:|"<>]+/g, '_').slice(0, 50);
          const vPath = `/${category}/${folderSlug}`;

          const fileIdx = newlySortedFiles.findIndex(f => f.id === file.id);
          if (fileIdx !== -1) {
            newlySortedFiles[fileIdx] = {
              ...file,
              title: safeTitle,
              aiMetadata: {
                extractedTitle: safeTitle,
                summary: meta.summary || "No summary available.",
                keywords: meta.keywords || [],
                features: meta.features || []
              },
              tags: [...(meta.keywords || []), ...(meta.features || [])],
              virtualPath: vPath
            };
          }
        });
        setAiProgress(prev => ({ ...prev, current: prev.current + chunk.length }));
      };

      for (let i = 0; i < chunks.length; i += concurrency) {
        const group = chunks.slice(i, i + concurrency);
        await Promise.all(group.map(processChunk));
      }

      setPreviewFiles(newlySortedFiles);
      setNotification({ message: "SortIt analysis complete! Review organization.", type: 'success' });
    } catch (err) {
      console.error("AI Sort Error:", err);
      setNotification({ message: "Sorting failed", type: 'error' });
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleApplySort = async (action: 'copy' | 'move' = 'copy') => {
    if (previewFiles.length === 0) return;

    setIsAIProcessing(true); // Re-use processing state for organization
    try {
      const operations = previewFiles.map(f => ({
        sourcePath: f.fullPath,
        virtualPath: f.virtualPath,
        filename: f.filename // Reverted to original filename
      }));

      const res = await fetch('/api/local/organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operations,
          targetRoot: targetPath || undefined,
          action
        })
      });

      const data = await res.json();
      if (data.success) {
        // Map destination paths back to files
        const finalizedFiles = previewFiles.map(f => {
          const opResult = data.results.find((r: any) => r.filename === f.filename && r.success);
          return opResult ? { ...f, organizedPath: opResult.destinationPath } : f;
        });

        await saveFiles(finalizedFiles);
        setPreviewFiles([]);
        setNotification({
          message: `Successfully ${action === 'move' ? 'moved' : 'copied'} ${operations.length} files!`,
          type: 'success'
        });
      } else {
        throw new Error(data.error || "Failed to organize files");
      }
    } catch (err: any) {
      console.error("Organize Error:", err);
      setNotification({ message: `Failed to organize: ${err.message}`, type: 'error' });
    } finally {
      setIsAIProcessing(false);
    }
  };

  const handleScanDirectory = async () => {
    const validPaths = sourcePaths.filter(p => p.trim() !== '');
    if (validPaths.length === 0) {
      setNotification({ message: "Please enter at least one source path", type: 'error' });
      return;
    }

    setIsScanning(true);
    try {
      let allFoundFiles: FileRecord[] = [];

      for (const path of validPaths) {
        const res = await fetch(`/api/local/scan?dirPath=${encodeURIComponent(path)}`);

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Failed to scan directory: ${res.statusText}`);
        }

        const data = await res.json();

        const newFiles: FileRecord[] = data.map((f: any) => ({
          ...f,
          title: f.filename,
          type: f.filename.split('.').pop() || 'unknown',
          aiMetadata: {
            extractedTitle: f.filename,
            summary: "Pending AI Analysis...",
            keywords: [],
            features: []
          },
          tags: [],
          categoryId: 'uncategorized',
          virtualPath: '/Inbox'
        }));

        allFoundFiles = [...allFoundFiles, ...newFiles];
      }

      const existingFiles = Array.isArray(files) ? files : [];
      await saveFiles([...existingFiles, ...allFoundFiles]);
      setNotification({ message: `Found ${allFoundFiles.length} files across ${validPaths.length} directories`, type: 'success' });
    } catch (err: any) {
      console.error("Scan error", err);
      setNotification({ message: `Scan failed: ${err.message}`, type: 'error' });
    } finally {
      setIsScanning(false);
    }
  };
  const deleteFile = async (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const fileToDelete = files.find(f => f.id === id);
    if (!fileToDelete) return;

    // If it was organized, delete the organized copy (but never the original fullPath)
    if (fileToDelete.organizedPath) {
      try {
        await fetch('/api/local/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: [fileToDelete.organizedPath] })
        });
      } catch (err) {
        console.error("Failed to delete organized copy:", err);
      }
    }

    const updated = files.filter(f => f.id !== id);
    await saveFiles(updated);
    setNotification({ message: "File entry cleared. Original file preserved.", type: 'success' });
  };

  const clearAllFiles = async () => {
    // Factory Reset: deletes organized copies and clears DB
    const organizedPaths = files.filter(f => f.organizedPath).map(f => f.organizedPath) as string[];

    if (organizedPaths.length > 0) {
      try {
        await fetch('/api/local/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: organizedPaths })
        });
      } catch (err) {
        console.error("Failed to clear organized copies:", err);
      }
    }

    await saveFiles([]);
    setNotification({ message: "Factory reset complete. All organized copies removed, originals preserved.", type: 'success' });
  };

  const clearUnsortedFiles = async () => {
    // Clear Unsorted: only clears Inbox files from DB
    const unsortedFiles = files.filter(f => f.virtualPath === '/Inbox' || !f.organizedPath);
    const unsortedIds = unsortedFiles.map(f => f.id);
    const updated = files.filter(f => !unsortedIds.includes(f.id));
    await saveFiles(updated);
    setNotification({ message: "Unsorted file entries cleared from library.", type: 'success' });
  };

  const deleteSelected = async () => {
    const selectedList = files.filter(f => selectedFiles.includes(f.id));
    const organizedPaths = selectedList.filter(f => f.organizedPath).map(f => f.organizedPath) as string[];

    if (organizedPaths.length > 0) {
      try {
        await fetch('/api/local/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: organizedPaths })
        });
      } catch (err) {
        console.error("Failed to delete selected organized copies:", err);
      }
    }

    const updated = files.filter(f => !selectedFiles.includes(f.id));
    await saveFiles(updated);
    setSelectedFiles([]);
    setNotification({ message: `Cleared ${selectedFiles.length} files. Originals preserved.`, type: 'success' });
  };

  const copyMetadata = (ids: string[]) => {
    const selectedData = files.filter(f => ids.includes(f.id)).map(f => ({
      filename: f.filename,
      title: f.title,
      type: f.type,
      size: f.size,
      virtualPath: f.virtualPath,
      metadata: f.aiMetadata,
      tags: f.tags
    }));

    const json = JSON.stringify(selectedData, null, 2);
    // Use the clipboard API directly if supported, with fallback if needed
    if (navigator.clipboard) {
      navigator.clipboard.writeText(json).then(() => {
        setNotification({ message: `Copied metadata for ${ids.length} files to clipboard`, type: 'success' });
      }).catch(err => {
        console.error("Copy failed", err);
        setNotification({ message: "Failed to copy to clipboard", type: 'error' });
      });
    } else {
      setNotification({ message: "Clipboard API not available", type: 'error' });
    }
  };

  const selectAll = () => {
    // Select all currently visible (filtered) files
    setSelectedFiles(filteredFiles.map(f => f.id));
    setNotification({ message: `Selected all ${filteredFiles.length} visible files`, type: 'success' });
  };

  const [showPathManager, setShowPathManager] = useState(false);

  const openFileLocation = async (filePath?: string) => {
    if (!filePath) return;
    try {
      await fetch('/api/local/open-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath })
      });
    } catch (err) {
      console.error("Failed to open location", err);
    }
  };

  const renameFile = async (id: string, newName: string) => {
    const updated = files.map(f => f.id === id ? { ...f, filename: newName } : f);
    await saveFiles(updated);
    setNotification({ message: "File renamed", type: 'success' });
  };

  const moveFiles = async (ids: string[], newPath: string) => {
    const cleanPath = newPath === 'All' ? '/' : (newPath.startsWith('/') ? newPath : '/' + newPath);
    const updated = files.map(f => ids.includes(f.id) ? { ...f, virtualPath: cleanPath } : f);
    await saveFiles(updated);
    setNotification({ message: `Moved ${ids.length} files to ${cleanPath}`, type: 'success' });
  };

  const renameFolder = async (oldPath: string, newName: string) => {
    const oldPrefix = oldPath === 'All' ? '/' : (oldPath.startsWith('/') ? oldPath : '/' + oldPath);
    const parts = oldPrefix.split('/').filter(Boolean);
    if (parts.length === 0 && oldPath !== 'All') return;

    const newParts = [...parts];
    if (newParts.length > 0) newParts[newParts.length - 1] = newName;
    const newPrefix = '/' + newParts.join('/');

    const updated = files.map(f => {
      if (f.virtualPath === oldPrefix || f.virtualPath.startsWith(oldPrefix + '/')) {
        const relativePath = f.virtualPath.slice(oldPrefix.length);
        return { ...f, virtualPath: newPrefix + relativePath };
      }
      return f;
    });
    await saveFiles(updated);
    setNotification({ message: "Folder renamed", type: 'success' });
  };

  const moveFolder = async (oldPath: string, newParent: string) => {
    const oldPrefix = oldPath === 'All' ? '/' : (oldPath.startsWith('/') ? oldPath : '/' + oldPath);
    const folderName = oldPath.split('/').pop() || '';
    const targetParent = newParent === 'All' ? '/' : (newParent.startsWith('/') ? newParent : '/' + newParent);
    const newPrefix = targetParent === '/' ? '/' + folderName : targetParent + '/' + folderName;

    if (newPrefix.startsWith(oldPrefix + '/')) {
      setNotification({ message: "Cannot move a folder into itself", type: 'error' });
      return;
    }

    const updated = files.map(f => {
      if (f.virtualPath === oldPrefix || f.virtualPath.startsWith(oldPrefix + '/')) {
        const relativePath = f.virtualPath.slice(oldPrefix.length);
        return { ...f, virtualPath: newPrefix + relativePath };
      }
      return f;
    });
    await saveFiles(updated);
    setNotification({ message: "Folder moved", type: 'success' });
  };

  const sidebarTreeData = useMemo(() => {
    const root: any = { name: 'Root', children: {} };
    files.forEach(file => {
      const parts = file.virtualPath.split('/').filter(Boolean);
      let current = root;
      parts.forEach(part => {
        if (!current.children[part]) {
          current.children[part] = { name: part, children: {} };
        }
        current = current.children[part];
      });
    });
    return root;
  }, [files]);

  const filteredFiles = files.filter(f => {
    const matchesSearch = f.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.aiMetadata.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()));

    const folderPath = selectedFolder === 'All' ? '/' : (selectedFolder.startsWith('/') ? selectedFolder : '/' + selectedFolder);
    const matchesFolder = selectedFolder === 'All' ||
      f.virtualPath === folderPath ||
      f.virtualPath.startsWith(folderPath + '/');
    return matchesSearch && matchesFolder;
  });

  return (
    <div className="min-h-screen flex bg-[#F0F0EE]">
      {notification && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${notification.type === 'success' || notification.type === 'all' ? 'bg-white border-green-100 text-green-600' : 'bg-white border-red-100 text-red-600'}`}>
          {notification.type === 'success' || notification.type === 'all' ? <CheckCircle2 size={18} /> : <Info size={18} />}
          <span className="text-sm font-bold">{notification.message}</span>
        </div>
      )}
      {/* Sidebar */}
      <aside className={`relative border-r border-border bg-[#F5F5F3] flex flex-col hidden lg:flex transition-all duration-300 ${isSidebarCollapsed ? 'w-20' : 'w-72'}`}>
        <button
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-20 z-20 w-6 h-6 bg-white border border-border rounded-full flex items-center justify-center text-gray-400 hover:text-accent shadow-sm transition-all"
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="flex-1 flex flex-col py-6 overflow-y-auto scrollbar-hide overflow-x-hidden">
          <div className={`flex items-center gap-3 text-primary font-display font-bold mb-10 whitespace-nowrap px-6 ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}>
            <div className="shrink-0">
              <Layers size={18} className="text-accent" />
            </div>
            {!isSidebarCollapsed && <span className="text-sm font-black uppercase tracking-widest">SortIt</span>}
          </div>

          <nav className="space-y-1.5 px-3">
            <button
              onClick={() => {
                setSelectedFolder('All');
                setIsSidebarTreeVisible(!isSidebarTreeVisible);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${selectedFolder === 'All'
                  ? 'bg-gray-200/50 text-primary font-black shadow-sm'
                  : 'text-gray-700 hover:bg-gray-100/50 font-bold'
                } ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
            >
              <Folder size={18} className={selectedFolder === 'All' ? 'text-primary' : 'text-gray-400'} />
              {!isSidebarCollapsed && (
                <>
                  <span className="flex-1 text-left">All Files</span>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform ${isSidebarTreeVisible ? 'rotate-180' : ''}`} />
                </>
              )}
            </button>
            {isSidebarTreeVisible && (
              <div className="pt-6 pb-2 px-3">
                <div className="flex items-center justify-between mb-4">
                  {!isSidebarCollapsed ? (
                    <>
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Source Folders</span>
                      <div className="h-px bg-border flex-1 ml-4" />
                    </>
                  ) : (
                    <div className="h-px bg-gray-200 w-8 mx-auto" />
                  )}
                </div>
                <SidebarTree
                  tree={sidebarTreeData}
                  selectedFolder={selectedFolder}
                  onSelectFolder={setSelectedFolder}
                  onRenameFolder={renameFolder}
                  onMoveFolder={moveFolder}
                  onMoveFiles={moveFiles}
                  isCollapsed={isSidebarCollapsed}
                />
              </div>
            )}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-border/40 mt-auto space-y-1 bg-gray-50/30">
          <button
            onClick={() => setShowSettings(true)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 transition-all hover:bg-gray-200/50 hover:text-primary ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            <SettingsIcon size={18} className="shrink-0" />
            {!isSidebarCollapsed && <span>Settings</span>}
          </button>
          <button
            onClick={() => setShowAbout(true)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-gray-600 transition-all hover:bg-gray-200/50 hover:text-primary ${isSidebarCollapsed ? 'justify-center px-0' : ''}`}
          >
            <Info size={18} className="shrink-0" />
            {!isSidebarCollapsed && <span>About</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Header */}
        <header className="h-16 px-6 border-b border-border bg-white flex items-center justify-between sticky top-0 z-10 gap-4 shrink-0">
          <div className="flex-1 max-w-md relative h-11">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, title, keywords..."
              className="w-full h-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-2 text-sm font-bold text-primary focus:ring-2 focus:ring-accent/20 transition-all outline-none shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-3">
            {/* Source Path Manager Popover */}
            <div className="relative h-11">
              <button
                onClick={() => setShowPathManager(!showPathManager)}
                className={`h-full flex items-center gap-2 bg-white border ${showPathManager ? 'border-accent shadow-sm ring-2 ring-accent/10' : 'border-gray-200'} rounded-xl px-4 transition-all hover:bg-gray-50 shadow-sm`}
              >
                <div className="flex flex-col items-start justify-center h-full">
                  <span className="text-[12px] font-black text-gray-500 uppercase tracking-widest leading-none">Source Paths</span>
                  {sourcePaths.filter(p => p.trim()).length > 0 && (
                    <span className="text-[10px] font-bold text-primary max-w-[150px] truncate leading-none mt-1">
                      {sourcePaths.filter(p => p.trim()).length} selected
                    </span>
                  )}
                </div>
                <ChevronDown size={16} className={`text-gray-400 transition-transform ${showPathManager ? 'rotate-180' : ''}`} />
              </button>

              {showPathManager && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowPathManager(false)}
                  />
                  <div className="absolute top-full mt-2 right-0 w-[28rem] bg-white border border-border rounded-2xl shadow-xl z-50 p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Manage Sources</h4>
                      <button
                        onClick={() => setSourcePaths([''])}
                        className="text-[10px] text-red-500 font-bold hover:underline"
                      >
                        CLEAR ALL
                      </button>
                    </div>

                    <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                      <div className="space-y-3 pr-1 pb-40">
                        {sourcePaths.map((path, idx) => (
                          <PathInput
                            key={idx}
                            value={path}
                            index={idx}
                            type="source"
                            onChange={(val) => {
                              const newPaths = [...sourcePaths];
                              newPaths[idx] = val;
                              setSourcePaths(newPaths);
                            }}
                            placeholder={sysConfig.platform === 'win32' ? 'C:\\Users\\Name\\Downloads' : '/Users/name/Downloads'}
                            onAdd={() => setSourcePaths([...sourcePaths, ''])}
                            onRemove={() => {
                              const newPaths = sourcePaths.filter((_, i) => i !== idx);
                              setSourcePaths(newPaths);
                            }}
                            isLast={idx === sourcePaths.length - 1}
                            isOnly={sourcePaths.length === 1}
                            className="bg-white border border-border rounded-lg px-2 py-1"
                            suggestions={suggestions}
                            showSuggestions={showSuggestions}
                            setShowSuggestions={setShowSuggestions}
                            fetchSuggestions={fetchSuggestions}
                            separator={sysConfig.separator}
                          />
                        ))}
                      </div>
                    </div>

                    <Button
                      onClick={() => {
                        handleScanDirectory();
                        setShowPathManager(false);
                      }}
                      disabled={isScanning || sourcePaths.filter(p => p.trim()).length === 0}
                      className="w-full py-2.5 text-xs gap-2"
                    >
                      {isScanning ? <Zap size={14} className="animate-pulse" /> : <Play size={18} />}
                      SCAN ALL SOURCES
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Output Path with Autocomplete */}
            <div
              className="group h-11 flex items-center bg-white border border-gray-200 rounded-xl px-4 transition-all focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent/40 shadow-sm cursor-text"
              onClick={() => {
                const input = document.querySelector('#output-path-input') as HTMLInputElement;
                if (input) input.focus();
              }}
            >
              <div className="flex flex-col items-start justify-center h-full">
                <span className="text-[12px] font-black text-gray-500 uppercase tracking-widest leading-none">Output Path</span>
                <div className={`relative w-72 transition-all duration-200 ${targetPath ? 'h-3.5 mt-1 opacity-100' : 'h-0 opacity-0 overflow-hidden group-focus-within:h-3.5 group-focus-within:mt-1 group-focus-within:opacity-100'}`}>
                  <PathInput
                    value={targetPath}
                    onChange={setTargetPath}
                    type="target"
                    placeholder=""
                    id="output-path-input"
                    className="w-full !p-0 !text-[11px] !font-bold"
                    suggestions={suggestions}
                    showSuggestions={showSuggestions}
                    setShowSuggestions={setShowSuggestions}
                    fetchSuggestions={fetchSuggestions}
                    separator={sysConfig.separator}
                  />
                </div>
              </div>
            </div>

            {/* View Switcher/Actions Group */}
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-gray-100/50 border border-gray-200 rounded-xl p-1 h-11 shadow-sm">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`h-full px-3 rounded-lg transition-all flex items-center justify-center ${viewMode === 'grid' ? 'bg-white shadow-sm text-accent border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <LayoutGrid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`h-full px-3 rounded-lg transition-all flex items-center justify-center ${viewMode === 'list' ? 'bg-white shadow-sm text-accent border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  <List size={18} />
                </button>
              </div>

              <Button
                onClick={runAISort}
                variant="accent"
                className="w-11 h-11 group shrink-0 font-bold shadow-lg shadow-accent/20 p-0 flex items-center justify-center rounded-xl"
                title={isAIProcessing ? "Analyzing..." : "Analyze & Sort"}
                disabled={isAIProcessing || files.length === 0}
              >
                {isAIProcessing ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin aspect-square" />
                ) : (
                  <Zap size={18} className="fill-white transition-transform group-hover:scale-110" />
                )}
              </Button>

              <Button
                onClick={generatePreview}
                variant="outline"
                className="w-11 h-11 shrink-0 border-gray-200 bg-white hover:bg-gray-50 text-gray-400 font-bold p-0 flex items-center justify-center rounded-xl"
                title="Preview"
                disabled={files.length === 0}
              >
                <Eye size={18} />
              </Button>
            </div>
          </div>
        </header>

        {/* AI Progress Bar */}
        {isAIProcessing && (
          <div className="bg-white border-b border-accent/10 px-6 py-2 flex items-center gap-4">
            <div className="flex-1 h-1.5 bg-accent/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${(aiProgress.current / aiProgress.total) * 100}%` }}
              />
            </div>
            <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
              AI Processing: {aiProgress.current}/{aiProgress.total} Files
            </span>
          </div>
        )}

        {/* Visual Tree Preview Modal */}
        {previewTree && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 md:p-12">
            <div className="bg-white rounded-[2rem] shadow-2xl flex flex-col w-full max-w-4xl h-full max-h-[80vh] overflow-hidden">
              <div className="p-8 border-b border-border flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-2xl font-display font-bold">Sort Preview</h2>
                  <p className="text-sm text-gray-500">Review how your files will be organized based on AI analysis.</p>
                </div>
                <button onClick={() => setPreviewTree(null)} className="p-2 hover:bg-panel rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 bg-[#F8F8F7] scrollbar-thin">
                <div className="max-w-lg mx-auto">
                  <TreeView
                    tree={previewTree}
                    onRenameNode={handleRenamePreviewNode}
                    onMoveNode={handleMovePreviewNode}
                  />
                </div>
              </div>

              <div className="p-8 border-t border-border flex items-center justify-between shrink-0 bg-white">
                <div className="flex items-center gap-2 text-gray-400">
                  <Info size={16} />
                  <span className="text-xs">Final hierarchy: Root / Category / AI Title / Original Filename</span>
                </div>
                <div className="flex items-center gap-3">
                  <Button variant="secondary" onClick={() => setPreviewTree(null)}>Cancel</Button>
                  <Button
                    variant="secondary"
                    className="border-accent text-accent hover:bg-accent/5"
                    onClick={() => handleApplySort('copy')}
                  >
                    Confirm & Copy
                  </Button>
                  <Button variant="accent" onClick={() => handleApplySort('move')}>Confirm & Move</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-primary/40 backdrop-blur-md" onClick={() => setShowSettings(false)} />
            <div className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden relative z-10 border border-white/20">
              {/* Dark Header */}
              <div className="bg-primary p-10 text-center relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6">
                  <button onClick={() => setShowSettings(false)} className="text-white/40 hover:text-white transition-colors">
                    <X size={24} />
                  </button>
                </div>
                <div className="inline-flex p-4 bg-white/10 rounded-2xl mb-4 backdrop-blur-xl ring-1 ring-white/20">
                  <SettingsIcon size={32} className="text-accent" />
                </div>
                <h2 className="text-3xl font-display font-bold text-white mb-1">Configuration</h2>
                <p className="text-white/40 font-bold uppercase tracking-[0.3em] text-[9px]">Fine-tune your AI Architect</p>
              </div>

              <div className="p-10 bg-white max-h-[60vh] overflow-y-auto scrollbar-hide">
                <div className="space-y-10">
                  {/* Local Storage Section */}
                  <section>
                    <label className="text-[10px] font-black text-slate-500 uppercase mb-4 block tracking-widest px-1">Local Infrastructure</label>
                    <div className="p-6 bg-panel rounded-[1.5rem] border border-border/60 shadow-sm flex items-center gap-6">
                      <div className="shrink-0 p-3 bg-white rounded-xl shadow-sm border border-border/50 text-accent">
                        <Database size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-black text-primary uppercase tracking-widest block mb-1">Metadata DB Path</span>
                        <code className="text-[11px] text-slate-600 font-mono break-all leading-tight block p-3 bg-white/50 rounded-lg border border-border/30">
                          {dbPath || '/app/db.json'}
                        </code>
                      </div>
                    </div>
                  </section>

                  {/* AI Provider Section */}
                  <section className="grid grid-cols-2 gap-10">
                    <div className="space-y-6">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase mb-4 block tracking-widest px-1">AI Provider</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['google', 'openai', 'anthropic', 'ollama', 'custom'] as AIProvider[]).map(p => (
                            <button
                              key={p}
                              onClick={() => setAiProvider(p)}
                              className={`px-3 py-3 rounded-xl text-[10px] font-black transition-all border ${aiProvider === p
                                  ? 'bg-accent/5 border-accent text-accent shadow-sm'
                                  : 'bg-white border-border/50 text-slate-500 hover:border-accent/30'
                                }`}
                            >
                              {p.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-500 uppercase block tracking-widest px-1">API Authentication</label>
                        <input
                          type="password"
                          value={apiKeys[aiProvider === 'custom' ? 'google' : aiProvider] || ''}
                          onChange={(e) => setApiKeys({ ...apiKeys, [aiProvider]: e.target.value })}
                          className="w-full bg-panel border-none rounded-xl px-4 py-4 text-xs outline-none focus:ring-2 ring-accent/20 transition-all font-mono text-primary placeholder:text-slate-400"
                          placeholder={`Enter ${aiProvider} key`}
                        />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase mb-4 block tracking-widest px-1">Model Architecture</label>
                        <input
                          type="text"
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          className="w-full bg-panel border-none rounded-xl px-4 py-4 text-xs outline-none focus:ring-2 ring-accent/20 transition-all font-mono mb-2 text-primary placeholder:text-slate-400"
                          placeholder="e.g. gemini-3-flash-preview"
                        />
                        <span className="text-[9px] text-slate-500 font-bold italic block px-1 leading-relaxed">Specify the model ID for your selected provider.</span>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase mb-4 block tracking-widest px-1">Analysis Depth</label>
                        <div className="flex gap-2 p-1.5 bg-panel rounded-2xl">
                          {(['coarse', 'fine'] as Granularity[]).map(g => (
                            <button
                              key={g}
                              onClick={() => setGranularity(g)}
                              className={`flex-1 py-2.5 text-[10px] font-black rounded-xl transition-all ${granularity === g ? 'bg-white shadow-sm text-primary' : 'text-slate-400'}`}
                            >
                              {g.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Performance Section */}
                  <section className="pt-6 border-t border-gray-100">
                    <label className="text-[10px] font-black text-slate-500 uppercase mb-6 block tracking-widest px-1">Engine Performance</label>
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[10px] font-black text-primary uppercase">Batch Size</span>
                          <span className="text-[10px] font-mono text-accent font-bold">{batchSize} files</span>
                        </div>
                        <input
                          type="range" min="1" max="200" step="1"
                          value={batchSize}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setBatchSize(val);
                            localStorage.setItem('sortit_batch_size', val.toString());
                          }}
                          className="w-full accent-accent h-1.5 bg-panel rounded-lg cursor-pointer"
                        />
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[10px] font-black text-primary uppercase">Parallelism</span>
                          <span className="text-[10px] font-mono text-accent font-bold">{concurrency} channels</span>
                        </div>
                        <input
                          type="range" min="1" max="20" step="1"
                          value={concurrency}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setConcurrency(val);
                            localStorage.setItem('sortit_concurrency', val.toString());
                          }}
                          className="w-full accent-accent h-1.5 bg-panel rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="text-[9px] text-slate-500 font-bold italic mt-4 block px-1">Higher values speed up 7000+ file libraries but may trigger rate limits.</div>
                  </section>

                  {/* Maintenance Section */}
                  <section className="pt-6 border-t border-gray-100 flex items-center justify-between">
                    <div>
                      <h4 className="text-[11px] font-black text-primary uppercase tracking-widest mb-1">System Maintenance</h4>
                      <p className="text-[10px] text-slate-500 font-bold">Clear cached states or reset the application.</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={clearUnsortedFiles} className="px-4 py-2 bg-panel hover:bg-gray-200/50 rounded-xl text-[10px] font-black text-slate-600 transition-all">CLEAR CACHE</button>
                      <button onClick={clearAllFiles} className="px-4 py-2 bg-red-50 hover:bg-red-100 rounded-xl text-[10px] font-black text-red-600 transition-all">FACTORY RESET</button>
                    </div>
                  </section>
                </div>
              </div>

              <div className="p-10 bg-gray-50/50 border-t border-gray-100">
                <Button
                  onClick={() => { saveSettings(apiKeys, granularity, aiModel); setShowSettings(false); }}
                  className="w-full py-4 rounded-2xl shadow-xl shadow-primary/10 font-black tracking-widest text-[11px] uppercase"
                >
                  Apply Preferences
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Browser Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-4xl font-display font-black tracking-tight text-primary">
                {selectedFolder === 'All' ? 'My Files' : selectedFolder}
              </h2>
              <p className="text-sm font-bold text-gray-600 mt-1">{filteredFiles.length} items found</p>
            </div>

            {selectedFiles.length > 0 && (
              <div className="flex items-center gap-3 bg-white p-2 rounded-xl shadow-lg border border-border">
                <span className="text-xs font-semibold px-2">{selectedFiles.length} selected</span>
                <Button onClick={selectAll} variant="secondary" size="sm" className="gap-2">
                  <span className="text-[10px] font-bold">SELECT ALL</span>
                </Button>
                <Button onClick={() => copyMetadata(selectedFiles)} variant="secondary" size="sm" className="gap-2">
                  <Copy size={14} />
                  <span className="text-[10px] font-bold">JSON</span>
                </Button>
                <Button onClick={deleteSelected} variant="danger" size="sm" className="gap-2">
                  <Trash2 size={14} />
                </Button>
                <Button onClick={() => setSelectedFiles([])} variant="ghost" size="sm">
                  <X size={14} />
                </Button>
              </div>
            )}
          </div>

          {isScanning && (
            <div className="mb-6 p-4 bg-accent/5 border border-accent/20 rounded-xl relative overflow-hidden">
              <div className="flex items-center gap-3 z-10 relative">
                <Search className="text-accent" size={18} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-accent">Scanning local directory...</div>
                  <div className="text-[10px] text-accent/60 italic overflow-hidden text-ellipsis whitespace-nowrap">Accessing: {sourcePaths.filter(p => p).join(', ')}</div>
                </div>
              </div>
            </div>
          )}

          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center opacity-60">
              <Folder className="w-20 h-20 mb-6 text-gray-300" />
              <h3 className="text-xl font-black text-primary mb-2">No files found</h3>
              <p className="text-sm font-bold text-gray-500 max-w-xs mx-auto">Scan a directory to start organizing your local files with AI Intelligence.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {filteredFiles.map((file) => (
                <div
                  key={file.id}
                  draggable="true"
                  onDragStart={(e) => {
                    e.dataTransfer.setData('type', 'file');
                    e.dataTransfer.setData('sourceId', file.id);
                  }}
                  onClick={() => {
                    if (selectedFiles.includes(file.id)) {
                      setSelectedFiles(selectedFiles.filter(id => id !== file.id));
                    } else {
                      setSelectedFiles([...selectedFiles, file.id]);
                    }
                  }}
                  onDoubleClick={() => openFileLocation(file.organizedPath || file.fullPath)}
                  className={`group relative p-4 rounded-xl border transition-all cursor-pointer select-none ${selectedFiles.includes(file.id) ? 'bg-accent/10 border-accent shadow-md ring-2 ring-accent/10' : 'bg-white border-transparent hover:border-border hover:shadow-sm'}`}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2 rounded-lg flex items-center justify-center font-black text-[11px] min-w-[42px] border-2 ${file.type.includes('image') ? 'bg-blue-50 text-blue-500 border-blue-100' : file.type.includes('pdf') ? 'bg-red-50 text-red-500 border-red-100' : 'bg-orange-50 text-orange-500 border-orange-100'}`}>
                      {file.filename.split('.').pop()?.toUpperCase()}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); copyMetadata([file.id]); }}
                        className="p-1 hover:bg-panel text-gray-400 hover:text-accent rounded transition-colors"
                        title="Copy Metadata"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={(e) => deleteFile(file.id, e)}
                        className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-colors"
                        title="Delete file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div
                      className="text-[13px] font-black text-primary leading-tight hover:text-accent transition-colors truncate"
                      title={`Original: ${file.filename}\nDouble click to rename`}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        const n = prompt("Rename file:", file.filename);
                        if (n) renameFile(file.id, n);
                      }}
                    >
                      {file.title}
                    </div>
                    {file.title.toLowerCase() !== file.filename.toLowerCase() && (
                      <div className="text-[9px] text-slate-400 truncate uppercase font-mono font-bold tracking-tight" title={file.filename}>{file.filename}</div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5 h-6 overflow-hidden">
                    {file.tags.slice(0, 2).map((tag, idx) => (
                      <span key={idx} className="text-[8px] bg-panel px-2 py-0.5 rounded-full text-slate-500 font-black uppercase tracking-widest border border-border/50">#{tag}</span>
                    ))}
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/50 text-[10px] text-slate-400 flex justify-between font-bold">
                    <span className="tracking-tighter">{(file.size / 1024).toFixed(1)} KB</span>
                    <span className="truncate max-w-[55%] uppercase tracking-tighter" title={file.virtualPath}>{file.virtualPath}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-panel border-b border-border">
                  <tr>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-400">File</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-400">Keywords</th>
                    <th className="px-6 py-3 text-[10px] uppercase tracking-widest font-bold text-gray-400 text-right">Path</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFiles.map((file) => (
                    <tr
                      key={file.id}
                      draggable="true"
                      onDragStart={(e) => {
                        e.dataTransfer.setData('type', 'file');
                        e.dataTransfer.setData('sourceId', file.id);
                      }}
                      onClick={() => {
                        if (selectedFiles.includes(file.id)) {
                          setSelectedFiles(selectedFiles.filter(id => id !== file.id));
                        } else {
                          setSelectedFiles([...selectedFiles, file.id]);
                        }
                      }}
                      onDoubleClick={() => openFileLocation(file.organizedPath || file.fullPath)}
                      className={`border-b border-border/50 hover:bg-panel transition-colors cursor-pointer ${selectedFiles.includes(file.id) ? 'bg-accent/10' : ''}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-6 flex-1 min-w-0">
                          <div className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center font-black text-[9px] border-2 overflow-hidden px-1 text-center leading-none ${file.type.includes('image') ? 'bg-blue-50 text-blue-500 border-blue-100' : file.type.includes('pdf') ? 'bg-red-50 text-red-500 border-red-100' : 'bg-orange-50 text-orange-500 border-orange-100'}`}>
                            {file.filename.includes('.') ? file.filename.split('.').pop()?.toUpperCase() : 'FILE'}
                          </div>
                          <div
                            className="flex-1 min-w-0"
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              const n = prompt("Rename file:", file.filename);
                              if (n) renameFile(file.id, n);
                            }}
                            title={`Original: ${file.filename}\nDouble click to rename`}
                          >
                            <div className="text-[15px] font-black text-primary hover:text-accent transition-colors truncate tracking-tight">{file.title}</div>
                            {file.title.toLowerCase() !== file.filename.toLowerCase() && (
                              <div className="text-[10px] text-slate-400 font-bold truncate uppercase font-mono tracking-tighter opacity-60">{file.filename}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {file.tags.map((tag, idx) => (
                            <span key={idx} className="text-[9px] bg-panel px-2 py-0.5 rounded-full text-gray-600">#{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-[10px] text-gray-400">
                        <div className="flex items-center justify-end gap-2">
                          <span className="mr-2">{file.virtualPath}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); copyMetadata([file.id]); }}
                            className="p-1.5 hover:bg-panel text-gray-400 hover:text-accent rounded transition-colors"
                            title="Copy Metadata"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            onClick={(e) => deleteFile(file.id, e)}
                            className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Bar */}
        <footer className="shrink-0 py-6 px-12 bg-white border-t border-border/50 flex items-center justify-between gap-6 z-10">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-black text-accent uppercase tracking-widest leading-none">Live • {aiProvider}</span>
            </div>

            <div className="h-4 w-px bg-border/50" />

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 leading-none">V</span>
              <span className="text-xs font-black text-gray-500 leading-none tracking-widest">0.0.1</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] whitespace-nowrap flex items-center gap-4">
              <span>© {new Date().getFullYear()} • Created by <span className="text-primary font-black">Bhagesh</span></span>
              <div className="flex items-center gap-3 border-l border-border/50 pl-4">
                <a
                  href="https://github.com/bhagesh-h"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-primary transition-all"
                  title="GitHub"
                >
                  <Github size={16} />
                </a>
                <a
                  href="https://www.linkedin.com/in/bhagesh-hunakunti/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-primary transition-all"
                  title="LinkedIn"
                >
                  <Linkedin size={16} />
                </a>
              </div>
            </div>
          </div>
        </footer>
      </main>

      {/* Modals & Overlays */}
      {showAbout && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-primary/40 backdrop-blur-md"
            onClick={() => setShowAbout(false)}
          />
          <div
            className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden relative z-10 border border-white/20"
          >
            <div className="bg-primary p-12 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6">
                <button onClick={() => setShowAbout(false)} className="text-white/40 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="inline-flex p-4 bg-white/10 rounded-2xl mb-6 backdrop-blur-xl ring-1 ring-white/20">
                <Layers size={40} className="text-accent" />
              </div>
              <h2 className="text-4xl font-display font-bold text-white mb-2">SortIt</h2>
              <p className="text-white/40 font-bold uppercase tracking-[0.3em] text-[10px]">The Modern File Architect</p>
            </div>

            <div className="p-10 bg-white">
              <div className="grid grid-cols-2 gap-8">
                {[
                  { icon: <Zap size={24} className="text-accent" />, title: "AI Intelligence", desc: "Category extraction & smart naming via advanced machine learning." },
                  { icon: <Cpu size={24} className="text-blue-500" />, title: "100% Local", desc: "No cloud uploads. All file operations happen on your machine." },
                  { icon: <Layers size={24} className="text-orange-500" />, title: "Live Preview", desc: "Review structural changes before applying them to disk." },
                  { icon: <Database size={24} className="text-purple-500" />, title: "Virtual Library", desc: "Organize files into logical folders without moving them until you're ready." },
                ].map((f, i) => (
                  <div key={i} className="flex gap-4 group">
                    <div className="shrink-0 w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center transition-all group-hover:bg-gray-100 group-hover:scale-110 shadow-sm border border-border/30">
                      {f.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-primary text-[13px] mb-1 leading-tight">{f.title}</h4>
                      <p className="text-[11px] text-gray-500 leading-relaxed font-medium">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 pt-10 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-8">
                  <a href="https://github.com/bhagesh-h" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-all hover:scale-110">
                    <Github size={24} />
                  </a>
                  <a href="https://www.linkedin.com/in/bhagesh-hunakunti/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-primary transition-all hover:scale-110">
                    <Linkedin size={24} />
                  </a>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1">
                    VERSION 0.0.1 • ALPHA RELEASE
                  </div>
                  <div className="text-[12px] font-black text-primary">
                    © {new Date().getFullYear()} CREATED BY BHAGESH
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

