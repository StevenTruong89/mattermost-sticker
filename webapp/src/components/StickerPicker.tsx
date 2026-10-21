import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    getStickers,
    searchStickers,
    deleteSticker,
    getStickerImageUrl,
    bulkUploadStickers,
    BulkUploadResult,
    bulkDeleteStickers,
    getRecentStickers,
    getStickersByIds,
} from '../actions/api';
import { Sticker } from '../types';

// ─── Hooks ──────────────────────────────────────────────────────────────────

const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debouncedValue;
};

// ─── Confirm Dialog ─────────────────────────────────────────────────────────

interface ConfirmDialogProps {
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, danger, onConfirm, onCancel }) => (
    <div style={S.overlay} onClick={onCancel}>
        <div style={S.dialog} onClick={(e) => e.stopPropagation()}>
            <h3 style={S.dialogTitle}>{title}</h3>
            <p style={S.dialogMsg}>{message}</p>
            <div style={S.dialogActions}>
                <button style={S.btnGhost} onClick={onCancel}>Cancel</button>
                <button style={danger ? S.btnDanger : S.btnPrimary} onClick={onConfirm}>Delete</button>
            </div>
        </div>
    </div>
);

// ─── Sent Toast ─────────────────────────────────────────────────────────────

const SentToast: React.FC<{ name: string; onDone: () => void }> = ({ name, onDone }) => {
    useEffect(() => {
        const t = setTimeout(onDone, 1500);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <div style={S.toast}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ marginRight: 6 }}>
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
            </svg>
            "{name}" sent!
        </div>
    );
};

// ─── Bulk Upload Panel ──────────────────────────────────────────────────────

interface BulkUploadPanelProps {
    channelId: string;
    onDone: () => void;
}

const BulkUploadPanel: React.FC<BulkUploadPanelProps> = ({ channelId, onDone }) => {
    const [files, setFiles] = useState<FileList | null>(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState<BulkUploadResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleBulkUpload = async () => {
        if (!files || files.length === 0) return;
        try {
            setUploading(true);
            setError(null);
            const res = await bulkUploadStickers(files, channelId);
            setResult(res);
            setFiles(null);
            if (res.success.length > 0) {
                onDone();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div style={S.uploadPanel}>
            <div style={S.bulkInfo}>
                Files will use filename (without extension) as sticker name
            </div>
            <div
                style={S.uploadDrop}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length > 0) setFiles(e.dataTransfer.files); }}
            >
                <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => setFiles(e.target.files)} />
                {files ? (
                    <span style={{ fontSize: 12, color: 'var(--center-channel-color)' }}>{files.length} file(s) selected</span>
                ) : (
                    <span style={{ fontSize: 12, color: 'rgba(var(--center-channel-color-rgb), 0.56)' }}>Drop or click to select multiple</span>
                )}
            </div>
            {error && <div style={S.uploadError}>{error}</div>}
            {result && (
                <div style={S.bulkResult}>
                    <div style={{ color: 'var(--online-indicator)' }}>{result.success.length} uploaded</div>
                    {Object.keys(result.failed).length > 0 && (
                        <div style={{ color: 'rgb(var(--error-text-color-rgb))' }}>{Object.keys(result.failed).length} failed</div>
                    )}
                </div>
            )}
            <button
                style={!files || files.length === 0 || uploading ? S.btnUploadDisabled : S.btnUpload}
                onClick={handleBulkUpload}
                disabled={!files || files.length === 0 || uploading}
            >
                {uploading ? 'Uploading...' : `Upload ${files ? files.length : ''} sticker(s)`}
            </button>
        </div>
    );
};

// ─── Sticker Item ───────────────────────────────────────────────────────────

interface StickerItemProps {
    sticker: Sticker;
    isOwner: boolean;
    isSelected: boolean;
    isMultiSelect: boolean;
    isFocused: boolean;
    onSelect: (s: Sticker) => void;
    onDelete: (s: Sticker) => void;
    onToggleMulti: (id: string) => void;
    onHover: (s: Sticker | null) => void;
}

const StickerItem = React.memo<StickerItemProps>(
    ({ sticker, isOwner, isSelected, isMultiSelect, isFocused, onSelect, onDelete, onToggleMulti, onHover }) => (
        <div
            className="sp-item"
            style={{
                ...S.item,
                ...(isFocused ? S.itemFocused : {}),
                ...(isSelected ? S.itemSelected : {}),
            }}
            onClick={() => isMultiSelect ? onToggleMulti(sticker.id) : onSelect(sticker)}
            onMouseEnter={() => onHover(sticker)}
            onMouseLeave={() => onHover(null)}
            data-sticker-id={sticker.id}
        >
            {isMultiSelect && (
                <div style={S.itemCheckbox}>
                    <input type="checkbox" checked={isSelected} onChange={() => onToggleMulti(sticker.id)} style={{ accentColor: 'var(--button-bg)' }} />
                </div>
            )}
            <img
                className="sp-item-img"
                src={getStickerImageUrl(sticker.id)}
                alt={sticker.name}
                loading="lazy"
                decoding="async"
                style={S.itemImage}
            />
            {isOwner && !isMultiSelect && (
                <span style={S.itemOwnerIcon} title="Your sticker">
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor" /></svg>
                </span>
            )}
        </div>
    ),
    (p, n) => p.sticker.id === n.sticker.id && p.isSelected === n.isSelected && p.isFocused === n.isFocused && p.isMultiSelect === n.isMultiSelect
);

// ─── Main Component ─────────────────────────────────────────────────────────

interface StickerPickerProps {
    channelId: string;
    onSelect: (sticker: Sticker) => void;
    onClose: () => void;
    currentUserId: string;
}

type TabKey = 'recent' | 'mine' | 'all';

const StickerPicker: React.FC<StickerPickerProps> = ({ channelId, onSelect, onClose, currentUserId }) => {
    // ── State ──────────────────────────────────────────────────────────────
    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 250);

    const [activeTab, setActiveTab] = useState<TabKey>(() => {
        try { return (localStorage.getItem('sp_tab') as TabKey) || 'recent'; } catch { return 'recent'; }
    });
    const [recentIds, setRecentIds] = useState<string[]>([]);

    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const PER_PAGE = 50;

    // The tab the currently loaded stickers belong to. Used to tell "this tab has no stickers"
    // apart from "the previous tab had no stickers and we just switched".
    const [loadedTab, setLoadedTab] = useState<TabKey | null>(null);

    const [showBulkUpload, setShowBulkUpload] = useState(false);
    const [multiSelect, setMultiSelect] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [hoveredSticker, setHoveredSticker] = useState<Sticker | null>(null);
    const [focusedIndex, setFocusedIndex] = useState(-1);

    const [confirmDialog, setConfirmDialog] = useState<{
        title: string; message: string; onConfirm: () => void;
    } | null>(null);
    const [sentToast, setSentToast] = useState<string | null>(null);
    const [refresh, setRefresh] = useState(0);

    const gridRef = useRef<HTMLDivElement>(null);
    const loadMoreRef = useRef<HTMLDivElement>(null);
    const observerRef = useRef<IntersectionObserver | null>(null);

    // ── Data loading ───────────────────────────────────────────────────────

    const loadStickers = useCallback(async (pageNum: number, isLoadMore: boolean) => {
        const tabAtRequest = activeTab;
        try {
            if (isLoadMore) setLoadingMore(true); else { setLoading(true); setLoadedTab(null); }
            setError(null);

            const ids = getRecentStickers();
            setRecentIds(ids);

            let result;
            if (debouncedSearch) {
                result = await searchStickers(debouncedSearch);
            } else if (activeTab === 'recent') {
                result = ids.length > 0 ? await getStickersByIds(ids) : {stickers: [], total: 0};
            } else if (activeTab === 'mine') {
                result = await getStickers(pageNum, PER_PAGE, 'name', 'asc', currentUserId);
            } else {
                result = await getStickers(pageNum, PER_PAGE, 'name', 'asc');
            }

            if (isLoadMore) {
                setStickers((prev) => [...prev, ...result.stickers]);
            } else {
                setStickers(result.stickers);
            }

            if (!isLoadMore) {
                setLoadedTab(tabAtRequest);
            }

            if (debouncedSearch || activeTab === 'recent') {
                setHasMore(false);
            } else {
                const total = isLoadMore ? stickers.length + result.stickers.length : result.stickers.length;
                setHasMore(total < result.total && result.stickers.length > 0);
            }
        } catch {
            setError('Failed to load');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [debouncedSearch, activeTab, currentUserId, stickers.length]);

    useEffect(() => { setPage(1); setHasMore(true); loadStickers(1, false); }, [activeTab, debouncedSearch, refresh]);
    useEffect(() => { if (page > 1) loadStickers(page, true); }, [page]);

    // Save active tab to localStorage
    useEffect(() => { try { localStorage.setItem('sp_tab', activeTab); } catch {} }, [activeTab]);

    // Infinite scroll
    useEffect(() => {
        if (loading || loadingMore || !hasMore) return;
        observerRef.current?.disconnect();
        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) setPage((p) => p + 1);
        }, { rootMargin: '200px' });
        if (loadMoreRef.current) observerRef.current.observe(loadMoreRef.current);
        return () => observerRef.current?.disconnect();
    }, [loading, loadingMore, hasMore, stickers.length]);

    // Auto-fallback: only when the loaded data actually belongs to the current tab,
    // otherwise switching to "Mine" would bounce back to "All" while the list is still empty.
    useEffect(() => {
        if (loading || loadingMore || debouncedSearch) return;
        if (loadedTab !== activeTab) return;
        if (stickers.length > 0) return;
        if (activeTab === 'recent') setActiveTab('mine');
        else if (activeTab === 'mine') setActiveTab('all');
    }, [stickers.length, activeTab, loading, loadingMore, debouncedSearch, loadedTab]);

    // ── Keyboard navigation ────────────────────────────────────────────────

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (confirmDialog) setConfirmDialog(null);
                else onClose();
                return;
            }

            const grid = gridRef.current;
            if (!grid) return;
            const items = grid.querySelectorAll<HTMLElement>('[data-sticker-id]');
            if (items.length === 0) return;

            // Calculate grid columns
            const gridStyle = window.getComputedStyle(grid);
            const columns = gridStyle.gridTemplateColumns.split(' ').length;

            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setFocusedIndex((prev) => Math.min(prev + 1, items.length - 1));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setFocusedIndex((prev) => Math.max(prev - 1, 0));
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex((prev) => Math.min(prev + columns, items.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex((prev) => Math.max(prev - columns, 0));
            } else if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < items.length) {
                e.preventDefault();
                const id = items[focusedIndex].dataset.stickerId;
                const sticker = stickers.find((s) => s.id === id);
                if (sticker) handleSelect(sticker);
            }
        };

        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose, focusedIndex, stickers, confirmDialog]);

    // Scroll focused item into view
    useEffect(() => {
        if (focusedIndex < 0) return;
        const grid = gridRef.current;
        if (!grid) return;
        const items = grid.querySelectorAll<HTMLElement>('[data-sticker-id]');
        if (items[focusedIndex]) {
            items[focusedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [focusedIndex]);

    // ── Handlers ───────────────────────────────────────────────────────────

    const handleSelect = (sticker: Sticker) => {
        onSelect(sticker);
        setSentToast(sticker.name);
    };

    const handleDelete = (sticker: Sticker) => {
        setConfirmDialog({
            title: `Delete "${sticker.name}"?`,
            message: 'This cannot be undone.',
            onConfirm: async () => {
                try { await deleteSticker(sticker.id); setRefresh((r) => r + 1); } catch {}
                setConfirmDialog(null);
            },
        });
    };

    const handleBulkDelete = () => {
        if (selected.size === 0) return;
        setConfirmDialog({
            title: `Delete ${selected.size} sticker(s)?`,
            message: 'This cannot be undone.',
            onConfirm: async () => {
                try { await bulkDeleteStickers(Array.from(selected)); setSelected(new Set()); setMultiSelect(false); setRefresh((r) => r + 1); } catch {}
                setConfirmDialog(null);
            },
        });
    };

    const toggleMulti = (id: string) => {
        setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    };

    // ── Display list ───────────────────────────────────────────────────────

    const displayStickers = useMemo(() => {
        let list = stickers;
        if (activeTab === 'recent') {
            list = recentIds.map((id) => stickers.find((s) => s.id === id)).filter((s): s is Sticker => !!s);
        }
        if (debouncedSearch && activeTab !== 'all') {
            const q = debouncedSearch.toLowerCase();
            list = list.filter((s) => s.name.toLowerCase().includes(q));
        }
        return list;
    }, [stickers, activeTab, recentIds, debouncedSearch]);

    // ── Tab config ─────────────────────────────────────────────────────────

    const tabs: { key: TabKey; label: string; icon: React.ReactNode; count: number }[] = [
        { key: 'recent', label: 'Recent', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" fill="currentColor" /></svg>, count: recentIds.length },
        { key: 'mine', label: 'Mine', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor" /></svg>, count: stickers.filter((s) => s.creator_id === currentUserId).length },
        { key: 'all', label: 'All', icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" fill="currentColor" /></svg>, count: stickers.length },
    ];

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <>
            <style>{`
                @keyframes spIn { from { opacity:0; transform: scale(0.96); } to { opacity:1; transform: scale(1); } }
                @keyframes spFade { from { opacity:0; } to { opacity:1; } }
                @keyframes spPop { 0% { transform: scale(1); } 50% { transform: scale(1.15); } 100% { transform: scale(1); } }
                @keyframes spSlideUp { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
                .sp-item { 
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important; 
                    cursor: pointer;
                }
                .sp-item:hover { 
                    background: rgba(var(--center-channel-color-rgb), 0.08) !important; 
                    transform: translateY(-4px) scale(1.04) !important; 
                    box-shadow: 0 8px 20px rgba(0,0,0,0.12) !important;
                    border-color: rgba(var(--center-channel-color-rgb), 0.16) !important;
                }
                .sp-item-img { 
                    transition: transform 0.2s ease, filter 0.2s ease !important; 
                }
                .sp-item:hover .sp-item-img { 
                    transform: scale(1.08) !important; 
                    filter: brightness(1.05) !important;
                }
                .sp-item:active { 
                    transform: translateY(-1px) scale(1.01) !important; 
                    box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
                    transition-duration: 0.1s !important;
                }
                .sp-tab:hover { background: rgba(var(--center-channel-color-rgb), 0.08) !important; }
                .sp-search:focus { border-color: var(--button-bg) !important; box-shadow: 0 0 0 2px rgba(var(--button-bg-rgb), 0.15) !important; }
                .sp-clear:hover { background: rgba(var(--center-channel-color-rgb), 0.24) !important; }
                @media (max-width: 900px) {
                    .sp-preview-panel { display: none !important; }
                }
            `}</style>

            {/* Overlay */}
            <div style={S.overlay} onClick={onClose}>
                {/* Modal */}
                <div style={S.modal} onClick={(e) => e.stopPropagation()}>
                    {/* ── Sidebar ────────────────────────────────────── */}
                    <div style={S.sidebar}>
                        {/* Search */}
                        <div style={S.sidebarSearch}>
                            <div style={S.searchWrapper}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={S.searchIcon}>
                                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="currentColor" />
                                </svg>
                                <input
                                    type="search"
                                    className="sp-search"
                                    placeholder="Search stickers..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={S.searchInput}
                                />
                                {searchQuery && (
                                    <button className="sp-clear" style={S.searchClear} onClick={() => setSearchQuery('')}>
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" /></svg>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div style={S.sidebarTabs}>
                            {tabs.map((tab) => (
                                <button
                                    key={tab.key}
                                    className="sp-tab"
                                    style={activeTab === tab.key ? S.tabActive : S.tab}
                                    onClick={() => { setActiveTab(tab.key); setSearchQuery(''); setFocusedIndex(-1); setShowBulkUpload(false); }}
                                >
                                    <span style={S.tabIcon}>{tab.icon}</span>
                                    <span style={S.tabLabel}>{tab.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Sidebar bottom actions */}
                        <div style={S.sidebarBottom}>
                            {multiSelect ? (
                                <>
                                    <div style={S.multiInfo}>{selected.size} sel.</div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <button style={S.sidebarIconBtn} onClick={() => { setMultiSelect(false); setSelected(new Set()); }} title="Cancel">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" /></svg>
                                        </button>
                                        <button style={{ ...S.sidebarIconBtn, color: selected.size > 0 ? 'rgb(var(--error-text-color-rgb))' : undefined }} onClick={handleBulkDelete} disabled={selected.size === 0} title="Delete selected">
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor" /></svg>
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <button style={S.sidebarAction} onClick={() => { setShowBulkUpload(!showBulkUpload); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z" fill="currentColor" /></svg>
                                        <span style={{ marginLeft: 4 }}>Upload</span>
                                    </button>
                                    <button style={S.sidebarAction} onClick={() => { setMultiSelect(!multiSelect); setSelected(new Set()); }}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zm-6 18h2v-2h-2v2zm-8-8h2v-2H3v2zm0 4h2v-2H3v2zm8 4h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8h2v-2h-2v2zm0-4h2v-2h-2v2zm0-4h2V7h-2v2zm0 8h2v-2h-2v2z" fill="currentColor" /></svg>
                                        <span style={{ marginLeft: 4 }}>Select</span>
                                    </button>
                                </>
                            )}

                        </div>
                    </div>

                    {/* ── Content ────────────────────────────────────── */}
                    <div style={S.content}>
                        {/* Content header */}
                        <div style={S.contentHeader}>
                            <span style={S.contentTitle}>
                                {activeTab === 'recent' ? 'Recent' : activeTab === 'mine' ? 'My Stickers' : 'All Stickers'}
                            </span>
                            <span style={S.contentCount}>{displayStickers.length}</span>
                            <div style={{ flex: 1 }} />
                            <button style={S.closeBtn} onClick={onClose} title="Close (Esc)">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor" />
                                </svg>
                            </button>
                        </div>

                        {/* Upload panel (slide down) */}
                        {showBulkUpload && (
                            <div style={S.uploadContainer}>
                                <BulkUploadPanel channelId={channelId} onDone={() => { setRefresh((r) => r + 1); setShowBulkUpload(false); }} />
                            </div>
                        )}

                        {/* Error */}
                        {error && <div style={S.error}>{error}</div>}

                        {/* Sticker grid */}
                        <div ref={gridRef} style={S.grid}>
                            {showBulkUpload ? (
                                <div style={S.stateMsg}>
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, marginBottom: 8 }}>
                                        <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor" />
                                    </svg>
                                    Upload stickers
                                </div>
                            ) : loading ? (
                                <div style={S.stateMsg}><div style={S.spinner} /></div>
                            ) : displayStickers.length === 0 ? (
                                <div style={S.stateMsg}>
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, marginBottom: 8 }}>
                                        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" fill="currentColor" />
                                    </svg>
                                    {debouncedSearch ? 'No results' : 'No stickers'}
                                </div>
                            ) : (
                                <>
                                    {displayStickers.map((sticker, i) => (
                                        <StickerItem
                                            key={sticker.id}
                                            sticker={sticker}
                                            isOwner={sticker.creator_id === currentUserId}
                                            isSelected={selected.has(sticker.id)}
                                            isMultiSelect={multiSelect}
                                            isFocused={focusedIndex === i}
                                            onSelect={handleSelect}
                                            onDelete={handleDelete}
                                            onToggleMulti={toggleMulti}
                                            onHover={setHoveredSticker}
                                        />
                                    ))}
                                    {hasMore && !debouncedSearch && activeTab !== 'recent' && (
                                        <div ref={loadMoreRef} style={{ gridColumn: '1 / -1' }}>
                                            {loadingMore && <div style={S.stateMsg}><div style={S.spinner} /></div>}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* ── Preview Panel (always visible) ────────────── */}
                    <div className="sp-preview-panel" style={S.preview}>
                        {hoveredSticker ? (
                            <>
                                <img
                                    src={getStickerImageUrl(hoveredSticker.id)}
                                    alt={hoveredSticker.name}
                                    style={S.previewImage}
                                />
                                <span style={S.previewName}>{hoveredSticker.name}</span>
                                <span style={S.previewSize}>{hoveredSticker.file_size ? `${(hoveredSticker.file_size / 1024).toFixed(1)} KB` : ''}</span>
                            </>
                        ) : (
                            <span style={S.previewEmpty}>Hover to preview</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Toast */}
            {sentToast && <SentToast name={sentToast} onDone={() => setSentToast(null)} />}

            {/* Confirm Dialog */}
            {confirmDialog && (
                <ConfirmDialog
                    title={confirmDialog.title}
                    message={confirmDialog.message}
                    danger
                    onConfirm={confirmDialog.onConfirm}
                    onCancel={() => setConfirmDialog(null)}
                />
            )}
        </>
    );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
    // Overlay
    overlay: {
        position: 'fixed', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000,
        animation: 'spFade 0.15s ease-out',
        backdropFilter: 'blur(2px)',
    },

    // Modal - sidebar + content + preview layout
    modal: {
        position: 'relative',
        display: 'flex',
        width: 'min(96vw, 1100px)',
        height: 'min(88vh, 680px)',
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'var(--center-channel-bg)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
        animation: 'spIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
    },

    // ── Sidebar ────────────────────────────────────────────────────
    sidebar: {
        width: 160,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(var(--center-channel-color-rgb), 0.12)',
        backgroundColor: 'rgba(var(--center-channel-color-rgb), 0.04)',
    },

    sidebarSearch: {
        padding: '12px 10px 8px',
    },
    searchWrapper: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    },
    searchIcon: {
        position: 'absolute',
        left: 10,
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        pointerEvents: 'none',
    },
    searchInput: {
        width: '100%',
        padding: '9px 30px 9px 32px',
        borderRadius: 8,
        border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
        fontSize: 13,
        backgroundColor: 'var(--center-channel-bg)',
        color: 'var(--center-channel-color)',
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s, box-shadow 0.15s',
    },
    searchClear: {
        position: 'absolute',
        right: 8,
        width: 18,
        height: 18,
        borderRadius: '50%',
        border: 'none',
        background: 'rgba(var(--center-channel-color-rgb), 0.16)',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        padding: 0,
        transition: 'background 0.15s',
    },

    sidebarTabs: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        padding: '0 6px',
        overflowY: 'auto',
    },

    // Tab items
    tab: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 500,
        textAlign: 'left',
        transition: 'all 0.12s',
    },
    tabActive: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 6,
        border: 'none',
        background: 'var(--button-bg)',
        color: 'var(--button-color)',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'left',
    },
    tabIcon: { display: 'flex', alignItems: 'center', flexShrink: 0 },
    tabLabel: { flex: 1 },

    // Sidebar bottom
    sidebarBottom: {
        padding: '8px 6px',
        borderTop: '1px solid rgba(var(--center-channel-color-rgb), 0.12)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
    },
    sidebarAction: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '7px 0',
        borderRadius: 6,
        border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
        background: 'var(--center-channel-bg)',
        color: 'var(--center-channel-color)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 500,
    },
    multiInfo: {
        fontSize: 11,
        textAlign: 'center',
        color: 'var(--button-bg)',
        fontWeight: 600,
        padding: '2px 0',
    },
    sidebarIconBtn: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 32,
        height: 32,
        borderRadius: 6,
        border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
        background: 'var(--center-channel-bg)',
        color: 'var(--center-channel-color)',
        cursor: 'pointer',
        padding: 0,
    },

    // ── Content ────────────────────────────────────────────────────
    content: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
        paddingRight: 0,
    },

    contentHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(var(--center-channel-color-rgb), 0.12)',
    },
    contentTitle: {
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--center-channel-color)',
    },
    contentCount: {
        fontSize: 11,
        fontWeight: 600,
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        backgroundColor: 'rgba(var(--center-channel-color-rgb), 0.08)',
        padding: '1px 6px',
        borderRadius: 8,
    },
    closeBtn: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28,
        borderRadius: 6,
        border: 'none',
        background: 'transparent',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        cursor: 'pointer',
    },

    // Upload panel
    uploadContainer: {
        padding: '10px 14px',
        borderBottom: '1px solid rgba(var(--center-channel-color-rgb), 0.12)',
        animation: 'spSlideUp 0.2s ease-out',
    },
    uploadPanel: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
    },
    uploadInput: {
        padding: '7px 10px',
        borderRadius: 6,
        border: '1px solid rgba(var(--center-channel-color-rgb), 0.16)',
        fontSize: 12,
        backgroundColor: 'var(--center-channel-bg)',
        color: 'var(--center-channel-color)',
        outline: 'none',
    },
    uploadDrop: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '12px 8px',
        borderRadius: 6,
        border: '1.5px dashed rgba(var(--center-channel-color-rgb), 0.24)',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        minHeight: 44,
    },
    uploadError: {
        fontSize: 11,
        color: 'rgb(var(--error-text-color-rgb))',
    },
    bulkInfo: {
        fontSize: 11,
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        fontStyle: 'italic',
    },
    bulkResult: {
        display: 'flex',
        gap: 8,
        fontSize: 11,
        fontWeight: 600,
    },
    previewSize: {
        marginTop: 4,
        fontSize: 11,
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
    },
    btnUpload: {
        padding: '7px 0',
        borderRadius: 6,
        border: 'none',
        background: 'var(--button-bg)',
        color: 'var(--button-color)',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
    },
    btnUploadDisabled: {
        padding: '7px 0',
        borderRadius: 6,
        border: 'none',
        background: 'rgba(var(--center-channel-color-rgb), 0.12)',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        cursor: 'not-allowed',
        fontSize: 12,
        fontWeight: 600,
    },

    // Error
    error: {
        margin: '0 14px',
        padding: '6px 10px',
        borderRadius: 6,
        backgroundColor: 'rgba(var(--error-text-color-rgb), 0.08)',
        color: 'rgb(var(--error-text-color-rgb))',
        fontSize: 12,
    },

    // Grid
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
        gap: 10,
        padding: '14px 18px 18px',
        overflowY: 'auto',
        flex: 1,
        alignContent: 'start',
        outline: 'none',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(var(--center-channel-color-rgb), 0.24) transparent',
    },

    // Sticker item
    item: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 8,
        borderRadius: 8,
        cursor: 'pointer',
        border: '2px solid transparent',
        transition: 'all 0.12s ease',
        animation: 'spPop 0.2s ease-out',
    },
    itemFocused: {
        borderColor: 'var(--button-bg)',
        background: 'rgba(var(--button-bg-rgb), 0.06)',
    },
    itemSelected: {
        borderColor: 'var(--button-bg)',
        background: 'rgba(var(--button-bg-rgb), 0.08)',
    },
    itemCheckbox: {
        position: 'absolute', top: 4, left: 4, zIndex: 2,
        width: 20, height: 20, borderRadius: 4,
        backgroundColor: 'var(--center-channel-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
    },
    itemImage: {
        width: '100%',
        aspectRatio: '1 / 1',
        objectFit: 'contain',
        borderRadius: 6,
        transition: 'transform 0.2s ease, filter 0.2s ease',
    },
    itemOwnerIcon: {
        position: 'absolute', bottom: 3, right: 3,
        width: 14, height: 14,
        borderRadius: '50%',
        backgroundColor: 'var(--button-bg)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: 0.7,
    },

    // Hover preview - always visible right panel (separate column)
    preview: {
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(var(--center-channel-color-rgb), 0.04)',
        borderLeft: '1px solid rgba(var(--center-channel-color-rgb), 0.12)',
        padding: 24,
    },
    previewImage: {
        maxWidth: '100%',
        maxHeight: 300,
        objectFit: 'contain',
        transition: 'transform 0.2s ease',
    },
    previewName: {
        marginTop: 10,
        fontSize: 13,
        fontWeight: 600,
        color: 'var(--center-channel-color)',
        textAlign: 'center',
        wordBreak: 'break-word',
    },
    previewEmpty: {
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        fontSize: 12,
        textAlign: 'center',
    },

    // State
    stateMsg: {
        gridColumn: '1 / -1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 0',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        fontSize: 13,
    },
    spinner: {
        width: 24, height: 24,
        border: '2.5px solid rgba(var(--center-channel-color-rgb), 0.16)',
        borderTopColor: 'var(--button-bg)',
        borderRadius: '50%',
        animation: 'spin 0.6s linear infinite',
    },

    // Toast
    toast: {
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: 'var(--online-indicator)',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: 20,
        fontSize: 13,
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: 10001,
        animation: 'spSlideUp 0.2s ease-out',
    },

    // Dialog
    overlay2: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 },
    dialog: { backgroundColor: 'var(--center-channel-bg)', borderRadius: 12, padding: 24, maxWidth: 340, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' },
    dialogTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 600, color: 'var(--center-channel-color)' },
    dialogMsg: { margin: '0 0 16px', fontSize: 13, color: 'rgba(var(--center-channel-color-rgb), 0.56)', lineHeight: 1.5 },
    dialogActions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
    btnGhost: { padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(var(--center-channel-color-rgb), 0.24)', background: 'var(--center-channel-bg)', color: 'var(--center-channel-color)', cursor: 'pointer', fontSize: 13, fontWeight: 500 },
    btnPrimary: { padding: '7px 14px', borderRadius: 6, border: 'none', background: 'var(--button-bg)', color: 'var(--button-color)', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
    btnDanger: { padding: '7px 14px', borderRadius: 6, border: 'none', background: 'rgb(var(--error-text-color-rgb))', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 },
};

// Spin animation
const spinEl = document.createElement('style');
spinEl.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
if (!document.getElementById('sp-spin')) { spinEl.id = 'sp-spin'; document.head.appendChild(spinEl); }

export default StickerPicker;
