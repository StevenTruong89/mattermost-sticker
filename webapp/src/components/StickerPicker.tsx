import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Sticker } from '../types';
import { getStickers, searchStickers, uploadSticker, uploadStickerFromURL, deleteSticker, getStickerImageUrl, bulkUploadStickers, BulkUploadResult, bulkDeleteStickers, BulkDeleteResult, getRecentStickers } from '../actions/api';

// Virtualization hook for performance
const useVirtualization = (items: Sticker[], itemHeight: number, containerHeight: number, overscan = 5) => {
    const [scrollTop, setScrollTop] = useState(0);

    const virtualItems = useMemo(() => {
        const totalHeight = items.length * itemHeight;
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
        const visibleCount = Math.ceil(containerHeight / itemHeight);
        const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2);

        return {
            virtualItems: items.slice(startIndex, endIndex),
            startIndex,
            totalHeight,
            offsetY: startIndex * itemHeight,
        };
    }, [items, itemHeight, scrollTop, containerHeight, overscan]);

    return { ...virtualItems, setScrollTop };
};

// Debounce hook for search
const useDebounce = <T,>(value: T, delay: number): T => {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
};

interface StickerPickerProps {
    channelId: string;
    onSelect: (sticker: Sticker) => void;
    onClose: () => void;
    currentUserId: string;
}

const StickerPicker: React.FC<StickerPickerProps> = ({
    channelId,
    onSelect,
    onClose,
    currentUserId,
}) => {
    const [stickers, setStickers] = useState<Sticker[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showUpload, setShowUpload] = useState(false);
    const [uploadMode, setUploadMode] = useState<'file' | 'bulk'>('file');
    const [uploadName, setUploadName] = useState('');
    const [uploadFile, setUploadFile] = useState<File | null>(null);

    const [uploading, setUploading] = useState(false);
    const [bulkFiles, setBulkFiles] = useState<FileList | null>(null);
    const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [selectedStickers, setSelectedStickers] = useState<Set<string>>(new Set());
    const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
    const [sortBy, setSortBy] = useState<'name' | 'created_at' | 'creator_id'>('name');
    const [filterBy, setFilterBy] = useState<'all' | 'mine' | 'recent'>('recent');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [viewMode, setViewMode] = useState<'recent' | 'all' | 'mine'>('recent');
    const [recentStickerIds, setRecentStickerIds] = useState<string[]>([]);
    const [filteredStickers, setFilteredStickers] = useState<Sticker[]>([]);

    // Pagination states
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const PER_PAGE = 30;

    // Intersection Observer for Infinite Scroll
    const observer = useRef<IntersectionObserver | null>(null);
    const lastStickerElementRef = useCallback((node: HTMLDivElement | null) => {
        if (loading || isLoadingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) {
                setPage(prevPage => prevPage + 1);
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, isLoadingMore, hasMore]);

    // Debounce search query for performance
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    // State to track auto-filter fallback
    const [autoFilterAttempted, setAutoFilterAttempted] = useState(false);

    const loadStickers = useCallback(async (isLoadMore = false) => {
        try {
            if (isLoadMore) {
                setIsLoadingMore(true);
            } else {
                setLoading(true);
                setPage(1);
                setHasMore(true);
            }
            setError(null);

            const currentPage = isLoadMore ? page : 1;
            const result = debouncedSearchQuery
                ? await searchStickers(debouncedSearchQuery + (refreshTrigger ? `&t=${Date.now()}` : '')) // Search still returns all for now
                : await getStickers(currentPage, PER_PAGE);

            // Get recent sticker IDs from localStorage
            const recentIds = getRecentStickers();
            setRecentStickerIds(recentIds);

            let fetchedStickers = result.stickers;

            // If it's a search, backend doesn't paginate yet, so we handle total differently
            // but for getStickers, it's already paginated.
            const totalCount = result.total;

            if (isLoadMore) {
                setStickers(prev => [...prev, ...fetchedStickers]);
            } else {
                setStickers(fetchedStickers);
            }

            // Update hasMore
            if (debouncedSearchQuery) {
                // For search, we show all returned results at once (current backend behavior)
                setHasMore(false);
            } else {
                setHasMore(stickers.length + fetchedStickers.length < totalCount);
            }

        } catch (err) {
            setError('Failed to load stickers');
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    }, [debouncedSearchQuery, refreshTrigger, filterBy, sortBy, sortOrder, page]);

    // Reset and load when filters/search change
    useEffect(() => {
        loadStickers(false);
    }, [debouncedSearchQuery, filterBy, sortBy, sortOrder, refreshTrigger]);

    // Load next page
    useEffect(() => {
        if (page > 1 && !debouncedSearchQuery) {
            loadStickers(true);
        }
    }, [page]);

    // Update view mode based on filter selection
    useEffect(() => {
        if (filterBy === 'recent') {
            setViewMode('recent');
        } else if (filterBy === 'mine') {
            setViewMode('mine');
        } else {
            setViewMode('all');
        }
    }, [filterBy]);

    // Reset autoFilterAttempted when user manually changes filter
    useEffect(() => {
        setAutoFilterAttempted(false);
    }, [filterBy]);


    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleUpload = async () => {
        console.log('[Sticker] Upload clicked', { uploadName, uploadFile, uploadMode, channelId });

        if (!uploadName.trim()) {
            setError('Please provide a name');
            return;
        }

        if (uploadName.trim().length > 10) {
            setError('Name must be 10 characters or less');
            return;
        }

        if (uploadMode === 'file' && !uploadFile) {
            setError('Please select a file');
            return;
        }

        try {
            setUploading(true);
            setError(null);

            if (uploadMode === 'file' && uploadFile) {
                console.log('[Sticker] Uploading file...', uploadName, uploadFile.name);
                await uploadSticker(uploadName.trim(), uploadFile, channelId);
            }

            console.log('[Sticker] Upload success');
            setUploadName('');
            setUploadFile(null);
            setShowUpload(false);
            // Add delay to ensure server has processed the upload
            setTimeout(() => {
                setRefreshTrigger(prev => prev + 1); // Trigger refresh
            }, 500);
        } catch (err) {
            console.error('[Sticker] Upload error:', err);
            setError(err instanceof Error ? err.message : 'Failed to upload sticker');
        } finally {
            setUploading(false);
        }
    };

    const handleBulkUpload = async () => {
        if (!bulkFiles || bulkFiles.length === 0) {
            setError('Please select files');
            return;
        }

        try {
            setUploading(true);
            setError(null);
            setBulkResult(null);

            const result = await bulkUploadStickers(bulkFiles, channelId);
            setBulkResult(result);

            if (result.success.length > 0) {
                loadStickers();
            }

            if (Object.keys(result.failed).length === 0) {
                setBulkFiles(null);
                setShowUpload(false);
            }
        } catch (err) {
            console.error('[Sticker] Bulk upload error:', err);
            setError(err instanceof Error ? err.message : 'Failed to upload stickers');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (sticker: Sticker) => {
        if (!window.confirm(`Delete sticker "${sticker.name}"?`)) {
            return;
        }

        try {
            await deleteSticker(sticker.id);
            loadStickers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete sticker');
        }
    };

    const handleBulkDelete = async () => {
        if (selectedStickers.size === 0) {
            return;
        }

        if (!window.confirm(`Delete ${selectedStickers.size} selected sticker(s)?`)) {
            return;
        }

        try {
            const ids = Array.from(selectedStickers);
            await bulkDeleteStickers(ids);
            setIsMultiSelectMode(false);
            setSelectedStickers(new Set());
            loadStickers();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete stickers');
        }
    };

    const toggleStickerSelection = (stickerId: string) => {
        const newSelected = new Set(selectedStickers);
        if (newSelected.has(stickerId)) {
            newSelected.delete(stickerId);
        } else {
            newSelected.add(stickerId);
        }
        setSelectedStickers(newSelected);
    };

    // Memoized sticker item component for performance
    const StickerItem = React.memo<{
        sticker: Sticker;
        index: number;
        isMultiSelectMode: boolean;
        isSelected: boolean;
        onSelect: (sticker: Sticker) => void;
        onToggle: (id: string) => void;
        onDelete: (sticker: Sticker) => void;
        currentUserId: string;
    }>(({ sticker, isMultiSelectMode, isSelected, onSelect, onToggle, onDelete, currentUserId }) => (
        <div
            className="sticker-item"
            style={{
                ...styles.stickerItem,
                ...(isMultiSelectMode && isSelected ? styles.stickerItemSelected : {}),
            }}
            onClick={() => {
                if (isMultiSelectMode) {
                    onToggle(sticker.id);
                } else {
                    onSelect(sticker);
                }
            }}
            title={sticker.name}
        >
            {isMultiSelectMode && (
                <div style={styles.selectionCheckbox}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggle(sticker.id)}
                        style={styles.checkbox}
                    />
                </div>
            )}
            <div style={styles.stickerImageContainer}>
                <img
                    src={getStickerImageUrl(sticker.id)}
                    alt={sticker.name}
                    style={styles.stickerImage}
                />
            </div>
            {!isMultiSelectMode && sticker.creator_id === currentUserId && (
                <button
                    style={styles.deleteButton}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(sticker);
                    }}
                    title="Delete"
                >
                    &times;
                </button>
            )}
        </div>
    ), (prev, next) =>
        prev.sticker.id === next.sticker.id &&
        prev.isSelected === next.isSelected &&
        prev.isMultiSelectMode === next.isMultiSelectMode
    );

    return (
        <>
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .sticker-item:hover {
                    background-color: var(--center-channel-color-08, #f0f0f0) !important;
                    border-color: var(--center-channel-color-24, #ddd) !important;
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                }
                .sticker-item img {
                    transition: transform 0.2s ease;
                }
                .sticker-item:hover img {
                    transform: scale(1.05);
                }
            `}</style>
            <div style={styles.overlay} onClick={onClose}>
                <div style={styles.container} onClick={(e) => e.stopPropagation()}>
                    <div style={styles.header}>
                        <h3 style={styles.title}>Stickers</h3>
                        {isMultiSelectMode ? (
                            <div style={styles.headerActions}>
                                <span style={styles.selectedCount}>
                                    {selectedStickers.size} selected
                                </span>
                                <button
                                    style={styles.cancelSelectButton}
                                    onClick={() => {
                                        setIsMultiSelectMode(false);
                                        setSelectedStickers(new Set());
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        ) : (
                            <button style={styles.closeButton} onClick={onClose}>
                                &times;
                            </button>
                        )}
                    </div>

                    <div style={styles.searchContainer}>
                        <input
                            type="text"
                            placeholder="Search stickers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={styles.searchInput}
                        />
                        {isMultiSelectMode ? (
                            <button
                                style={styles.deleteButtonLarge}
                                onClick={handleBulkDelete}
                                disabled={selectedStickers.size === 0}
                            >
                                Delete Selected
                            </button>
                        ) : (
                            <button
                                style={styles.addButton}
                                onClick={() => setShowUpload(!showUpload)}
                            >
                                {showUpload ? 'Cancel' : '+ Add'}
                            </button>
                        )}
                    </div>

                    {!isMultiSelectMode && (
                        <div style={styles.viewInfoContainer}>
                            {viewMode === 'mine' && (
                                <div style={styles.viewModeBadge}>
                                    My Stickers
                                </div>
                            )}
                            {viewMode === 'all' && (
                                <div style={styles.viewModeBadge}>
                                    All Stickers
                                </div>
                            )}
                        </div>
                    )}

                    {!isMultiSelectMode && (
                        <div style={styles.filterSortContainer}>
                            <div style={styles.filterGroup}>
                                <label style={styles.filterLabel}>Filter:</label>
                                <select
                                    value={filterBy}
                                    onChange={(e) => setFilterBy(e.target.value as 'all' | 'mine' | 'recent')}
                                    style={styles.selectInput}
                                >
                                    <option value="all">All Stickers</option>
                                    <option value="mine">My Stickers</option>
                                    <option value="recent">Recent Stickers</option>
                                </select>
                            </div>
                            <div style={styles.sortGroup}>
                                <label style={styles.filterLabel}>Sort by:</label>
                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value as 'name' | 'created_at' | 'creator_id')}
                                    style={styles.selectInput}
                                >
                                    <option value="name">Name</option>
                                    <option value="created_at">Date Created</option>
                                    <option value="creator_id">Creator</option>
                                </select>
                                <button
                                    style={styles.sortOrderButton}
                                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                                    title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
                                >
                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                </button>
                            </div>
                            <button
                                style={styles.multiSelectButton}
                                onClick={() => setIsMultiSelectMode(true)}
                                disabled={stickers.length === 0}
                            >
                                Select Stickers
                            </button>
                        </div>
                    )}

                    {showUpload && (
                        <div style={styles.uploadContainer}>
                            <div style={styles.tabContainer}>
                                <button
                                    style={{
                                        ...styles.tab,
                                        ...(uploadMode === 'file' ? styles.tabActive : {}),
                                    }}
                                    onClick={() => { setUploadMode('file'); setBulkResult(null); }}
                                >
                                    File
                                </button>
                                <button
                                    style={{
                                        ...styles.tab,
                                        ...(uploadMode === 'bulk' ? styles.tabActive : {}),
                                    }}
                                    onClick={() => { setUploadMode('bulk'); setBulkResult(null); }}
                                >
                                    Bulk
                                </button>
                            </div>
                            {uploadMode === 'bulk' ? (
                                <>
                                    <div style={styles.bulkHint}>
                                        Select multiple files. Sticker names will be set from filenames (without extension).
                                    </div>
                                    <div style={styles.fileInputWrapper}>
                                        <input
                                            type="file"
                                            id="sticker-bulk-input"
                                            accept="image/png,image/gif,image/jpeg,image/webp"
                                            multiple
                                            onChange={(e) => {
                                                setBulkFiles(e.target.files);
                                                setBulkResult(null);
                                            }}
                                            style={styles.fileInputHidden}
                                        />
                                        <label htmlFor="sticker-bulk-input" style={styles.fileInputLabel}>
                                            {bulkFiles ? `${bulkFiles.length} file(s) selected` : 'Choose files...'}
                                        </label>
                                    </div>
                                    {bulkResult && (
                                        <div style={styles.bulkResult}>
                                            {bulkResult.success.length > 0 && (
                                                <div style={styles.bulkSuccess}>
                                                    Added: {bulkResult.success.join(', ')}
                                                </div>
                                            )}
                                            {Object.keys(bulkResult.failed).length > 0 && (
                                                <div style={styles.bulkFailed}>
                                                    Failed:
                                                    {Object.entries(bulkResult.failed).map(([file, reason]) => (
                                                        <div key={file} style={styles.bulkFailedItem}>
                                                            {file}: {reason}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <button
                                        style={{
                                            ...styles.uploadButton,
                                            ...(uploading || !bulkFiles || bulkFiles.length === 0 ? styles.uploadButtonDisabled : {}),
                                        }}
                                        onClick={handleBulkUpload}
                                        disabled={uploading || !bulkFiles || bulkFiles.length === 0}
                                    >
                                        {uploading ? 'Uploading...' : !bulkFiles ? 'Select files' : `Upload ${bulkFiles.length} file(s)`}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div style={styles.inputGroup}>
                                        <input
                                            type="text"
                                            placeholder="Sticker name (max 10 chars)"
                                            value={uploadName}
                                            onChange={(e) => setUploadName(e.target.value)}
                                            style={styles.uploadInput}
                                            maxLength={10}
                                        />
                                        <div style={styles.fileInputWrapper}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                const files = e.dataTransfer.files;
                                                if (files.length > 0) {
                                                    setUploadFile(files[0]);
                                                }
                                            }}>
                                            <input
                                                type="file"
                                                id="sticker-file-input"
                                                accept="image/png,image/gif,image/jpeg,image/webp"
                                                onChange={(e) => {
                                                    console.log('[Sticker] File selected:', e.target.files?.[0]);
                                                    setUploadFile(e.target.files?.[0] || null);
                                                }}
                                                style={styles.fileInputHidden}
                                            />
                                            <label htmlFor="sticker-file-input" style={styles.fileInputLabel}>
                                                <span style={styles.fileIcon}>📎</span>
                                                {uploadFile ? uploadFile.name : 'Choose file or drag & drop'}
                                            </label>
                                        </div>
                                    </div>
                                    <button
                                        style={{
                                            ...styles.uploadButton,
                                            ...(uploading || !uploadName.trim() || !uploadFile
                                                ? styles.uploadButtonDisabled
                                                : {}),
                                        }}
                                        onClick={handleUpload}
                                        disabled={uploading || !uploadName.trim() || !uploadFile}
                                    >
                                        {uploading
                                            ? 'Uploading...'
                                            : !uploadName.trim()
                                                ? 'Enter name'
                                                : !uploadFile
                                                    ? 'Select file'
                                                    : 'Upload Sticker'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {error && <div style={styles.error}>{error}</div>}

                    <div style={styles.grid}>
                        {loading ? (
                            <div style={styles.loading}>Loading...</div>
                        ) : stickers.length === 0 ? (
                            <div style={styles.empty}>
                                {debouncedSearchQuery ? 'No stickers found' : 'No stickers yet. Add one!'}
                            </div>
                        ) : (
                            <>
                                {stickers.map((sticker, index) => {
                                    if (stickers.length === index + 1) {
                                        return (
                                            <div ref={lastStickerElementRef} key={sticker.id}>
                                                <StickerItem
                                                    sticker={sticker}
                                                    index={index}
                                                    isMultiSelectMode={isMultiSelectMode}
                                                    isSelected={selectedStickers.has(sticker.id)}
                                                    onSelect={onSelect}
                                                    onToggle={toggleStickerSelection}
                                                    onDelete={handleDelete}
                                                    currentUserId={currentUserId}
                                                />
                                            </div>
                                        );
                                    }
                                    return (
                                        <StickerItem
                                            key={sticker.id}
                                            sticker={sticker}
                                            index={index}
                                            isMultiSelectMode={isMultiSelectMode}
                                            isSelected={selectedStickers.has(sticker.id)}
                                            onSelect={onSelect}
                                            onToggle={toggleStickerSelection}
                                            onDelete={handleDelete}
                                            currentUserId={currentUserId}
                                        />
                                    );
                                })}
                                {isLoadingMore && <div style={styles.loading}>Loading more...</div>}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

// Use CSS variables from Mattermost theme
const styles: { [key: string]: React.CSSProperties } = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease-out',
    },
    container: {
        backgroundColor: 'var(--center-channel-bg, #ffffff)',
        color: 'var(--center-channel-color, #3d3c40)',
        borderRadius: '12px',
        width: '80vw',
        maxWidth: '700px',
        maxHeight: '90vh',
        minHeight: '600px',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid var(--center-channel-color-16, #e0e0e0)',
    },
    headerActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    selectedCount: {
        fontSize: '14px',
        color: 'var(--center-channel-color-56, #666)',
    },
    cancelSelectButton: {
        padding: '4px 12px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        color: 'var(--center-channel-color, #3d3c40)',
        border: '1px solid var(--center-channel-color-24, #ddd)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
    },
    title: {
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
        color: 'var(--center-channel-color, #3d3c40)',
    },
    closeButton: {
        background: 'none',
        border: 'none',
        fontSize: '24px',
        cursor: 'pointer',
        color: 'var(--center-channel-color-56, #666)',
        padding: '0 4px',
    },
    searchContainer: {
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--center-channel-color-16, #e0e0e0)',
    },
    searchInput: {
        flex: 1,
        padding: '8px 12px',
        border: '1px solid var(--center-channel-color-24, #ddd)',
        borderRadius: '4px',
        fontSize: '14px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        color: 'var(--center-channel-color, #3d3c40)',
    },
    toolbar: {
        display: 'flex',
        padding: '8px 16px',
        borderBottom: '1px solid var(--center-channel-color-16, #e0e0e0)',
        gap: '8px',
    },
    viewInfoContainer: {
        padding: '8px 16px',
        backgroundColor: 'var(--button-bg-08, rgba(22, 109, 224, 0.08))',
        borderBottom: '1px solid var(--center-channel-color-16, #e0e0e0)',
        display: 'flex',
        alignItems: 'center',
    },
    viewModeBadge: {
        fontSize: '13px',
        fontWeight: 500,
        color: 'var(--button-bg, #166de0)',
    },
    filterSortContainer: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        padding: '8px 16px',
        borderBottom: '1px solid var(--center-channel-color-16, #e0e0e0)',
        backgroundColor: 'var(--center-channel-color-04, #f5f5f5)',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    filterGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    },
    sortGroup: {
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
    },
    filterLabel: {
        fontSize: '13px',
        color: 'var(--center-channel-color-56, #666)',
        fontWeight: 500,
    },
    selectInput: {
        padding: '6px 8px',
        border: '1px solid var(--center-channel-color-24, #ddd)',
        borderRadius: '4px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        color: 'var(--center-channel-color, #3d3c40)',
        fontSize: '13px',
        cursor: 'pointer',
    },
    sortOrderButton: {
        padding: '6px',
        border: '1px solid var(--center-channel-color-24, #ddd)',
        borderRadius: '4px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        color: 'var(--center-channel-color, #3d3c40)',
        cursor: 'pointer',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
    },
    multiSelectButton: {
        padding: '6px 12px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        color: 'var(--button-bg, #166de0)',
        border: '1px solid var(--button-bg, #166de0)',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: 500,
    },
    deleteButtonLarge: {
        padding: '8px 16px',
        backgroundColor: 'var(--danger-color, #c10000)',
        color: 'var(--button-color, #fff)',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 600,
        opacity: 1,
        transition: 'opacity 0.2s',
    },
    addButton: {
        padding: '8px 16px',
        backgroundColor: 'var(--button-bg, #166de0)',
        color: 'var(--button-color, #fff)',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 600,
    },
    uploadContainer: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 16px',
        backgroundColor: 'var(--center-channel-color-04, #f5f5f5)',
        borderBottom: '1px solid var(--center-channel-color-16, #e0e0e0)',
    },
    uploadInput: {
        padding: '8px 12px',
        border: '1px solid var(--center-channel-color-24, #ddd)',
        borderRadius: '4px',
        fontSize: '14px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        color: 'var(--center-channel-color, #3d3c40)',
    },
    tabContainer: {
        display: 'flex',
        gap: '4px',
    },
    tab: {
        flex: 1,
        padding: '6px 12px',
        border: '1px solid var(--center-channel-color-24, #ddd)',
        borderRadius: '4px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        color: 'var(--center-channel-color, #3d3c40)',
        cursor: 'pointer',
        fontSize: '13px',
    },
    tabActive: {
        backgroundColor: 'var(--button-bg, #166de0)',
        color: 'var(--button-color, #fff)',
        borderColor: 'var(--button-bg, #166de0)',
    },
    fileInputWrapper: {
        position: 'relative',
    },
    fileInputHidden: {
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        border: 0,
    },
    inputGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    },
    fileInputLabel: {
        padding: '12px 16px',
        backgroundColor: 'var(--center-channel-color-08, #f0f0f0)',
        border: '2px dashed var(--center-channel-color-24, #ddd)',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: 'var(--center-channel-color, #3d3c40)',
        transition: 'all 0.2s ease',
        minHeight: '48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    },
    fileIcon: {
        fontSize: '16px',
    },
    uploadButton: {
        padding: '8px 16px',
        backgroundColor: 'var(--button-bg, #166de0)',
        color: 'var(--button-color, #fff)',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 600,
    },
    uploadButtonDisabled: {
        backgroundColor: 'var(--center-channel-color-24, #ccc)',
        color: 'var(--center-channel-color-56, #888)',
        cursor: 'not-allowed',
    },
    error: {
        padding: '8px 16px',
        backgroundColor: 'var(--error-text-color-08, #ffebee)',
        color: 'var(--error-text-color, #c62828)',
        fontSize: '14px',
    },
    grid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
        gap: '12px',
        padding: '16px',
        overflowY: 'auto',
        overflowX: 'hidden',
        flex: 1,
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--center-channel-color-24, #ddd) transparent',
        maxWidth: '100%',
        // Performance optimization: use contain: size to limit layout recalculations
        contain: 'layout size',
    },
    stickerItem: {
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        border: '1px solid transparent',
        // Performance optimization: limit repaints
        willChange: 'transform, box-shadow',
    },
    stickerImageContainer: {
        position: 'relative',
        width: '100%',
        height: '100px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'var(--center-channel-color-04, #f5f5f5)',
        borderRadius: '4px',
        overflow: 'hidden',
    },
    stickerImage: {
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        backgroundColor: 'var(--center-channel-bg, #fff)',
    },
    stickerItemSelected: {
        backgroundColor: 'var(--button-bg-08, rgba(22, 109, 224, 0.08))',
        borderColor: 'var(--button-bg, #166de0)',
        border: '1px solid var(--button-bg, #166de0)',
    },
    selectionCheckbox: {
        position: 'absolute',
        top: '4px',
        left: '4px',
        zIndex: 10,
        backgroundColor: 'var(--center-channel-bg, #fff)',
        borderRadius: '50%',
        padding: '2px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    checkbox: {
        cursor: 'pointer',
        accentColor: 'var(--button-bg, #166de0)',
    },
    stickerName: {
        fontSize: '10px',
        marginTop: '4px',
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
        color: 'var(--center-channel-color, #3d3c40)',
    },
    deleteButton: {
        position: 'absolute',
        top: '2px',
        right: '2px',
        background: 'var(--error-text-color, #d24b4e)',
        color: '#fff',
        border: 'none',
        borderRadius: '50%',
        width: '18px',
        height: '18px',
        fontSize: '12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    loading: {
        gridColumn: '1 / -1',
        textAlign: 'center',
        padding: '20px',
        color: 'var(--center-channel-color-56, #666)',
    },
    empty: {
        gridColumn: '1 / -1',
        textAlign: 'center',
        padding: '20px',
        color: 'var(--center-channel-color-56, #666)',
    },
    bulkHint: {
        fontSize: '12px',
        color: 'var(--center-channel-color-56, #666)',
        marginBottom: '4px',
    },
    bulkResult: {
        padding: '8px',
        borderRadius: '4px',
        backgroundColor: 'var(--center-channel-bg, #fff)',
        border: '1px solid var(--center-channel-color-24, #ddd)',
        fontSize: '12px',
        maxHeight: '100px',
        overflowY: 'auto',
    },
    bulkSuccess: {
        color: 'var(--online-indicator, #3db887)',
        marginBottom: '4px',
    },
    bulkFailed: {
        color: 'var(--error-text-color, #d24b4e)',
    },
    bulkFailedItem: {
        marginLeft: '8px',
        fontSize: '11px',
    },
    loadMore: {
        gridColumn: '1 / -1',
        textAlign: 'center',
        padding: '20px',
    },
    loadMoreButton: {
        padding: '10px 20px',
        backgroundColor: 'var(--button-bg, #166de0)',
        color: 'var(--button-color, #fff)',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 500,
    },
    loadMoreButtonDisabled: {
        padding: '10px 20px',
        backgroundColor: 'var(--center-channel-color-24, #ccc)',
        color: 'var(--center-channel-color-56, #888)',
        border: 'none',
        borderRadius: '4px',
        cursor: 'not-allowed',
        fontSize: '14px',
        fontWeight: 500,
    },
};

export default StickerPicker;
