import React from 'react';
import ReactDOM from 'react-dom';
import { PluginRegistry, Store, Sticker } from './types';
import StickerPicker from './components/StickerPicker';
import StickerPost from './components/StickerPost';
import { StickerIcon } from './components/StickerButton';
import { doPost } from './actions/api';

const PLUGIN_ID = 'com.example.sticker';
// Force new bundle hash - PERFORMANCE OPTIMIZATION v1.5.0

declare global {
    interface Window {
        registerPlugin: (id: string, plugin: Plugin) => void;
    }
}

interface PluginState {
    pickerVisible: boolean;
    channelId: string;
    rootId: string;
}

class Plugin {
    private registry: PluginRegistry | null = null;
    private store: Store | null = null;
    private registeredComponents: string[] = [];
    private pickerContainer: HTMLDivElement | null = null;
    private state: PluginState = {
        pickerVisible: false,
        channelId: '',
        rootId: '',
    };

    public initialize(registry: PluginRegistry, store: Store): void {
        this.registry = registry;
        this.store = store;

        // Register custom post type for stickers
        registry.registerPostTypeComponent('custom_sticker', StickerPost);

        // Register file upload method (appears in attachment menu, bottom left)
        if ((registry as any).registerFileUploadMethod) {
            (registry as any).registerFileUploadMethod(
                <StickerIcon />,
                this.openStickerPicker.bind(this),
                'Stickers'
            );
        }

        // Also register channel header button as fallback
        // registry.registerChannelHeaderButtonAction(
        //     <StickerIcon />,
        //     this.openStickerPicker.bind(this),
        //     'Stickers',
        //     'Send a sticker'
        // );

        // Note: RHS button registration not supported in this Mattermost version
        // Users can send stickers from main channel view

        // Create picker container
        this.createPickerContainer();
    }

    private createPickerContainer(): void {
        this.pickerContainer = document.createElement('div');
        this.pickerContainer.id = 'sticker-picker-container';
        document.body.appendChild(this.pickerContainer);
    }

    private openStickerPicker(channelIdOrObject: string | { id?: string; channel_id?: string; root_id?: string } | undefined): void {
        if (!this.pickerContainer || !this.store) return;

        const state = this.store.getState();
        const currentUserId = state.entities?.users?.currentUserId || '';

        console.log('[Sticker] openStickerPicker called with:', channelIdOrObject);
        console.log('[Sticker] Current state views:', state.views);
        console.log('[Sticker] RHS state:', state.views?.rhs?.rhsState);
        console.log('[Sticker] RHS selectedPostId:', state.views?.rhs?.selectedPostId);
        console.log('[Sticker] Thread selectedPostId:', (state as any).views?.thread?.selectedPostId);
        console.log('[Sticker] Current channel:', state.entities?.channels?.currentChannelId);
        console.log('[Sticker] Full RHS state:', state.views?.rhs);

        // Check for thread management state (similar to emoji picker)
        console.log('[Sticker] Checking thread management state...');
        console.log('[Sticker] views.threads:', (state as any).views?.threads);
        console.log('[Sticker] views.threadManagement:', (state as any).views?.threadManagement);
        console.log('[Sticker] entities.threads:', state.entities?.threads);

        // FOCUS DETECTION: Check which text input currently has focus
        const activeElement = document.activeElement;
        const isRhsInputFocused = activeElement &&
            (activeElement.closest('[data-testid="rhs"]') ||
                activeElement.closest('.sidebar--right') ||
                activeElement.matches('[data-testid*="rhs"] *, .sidebar--right *'));
        const isMainInputFocused = activeElement &&
            (activeElement.closest('[data-testid="post_textbox"]') ||
                activeElement.closest('.post-create__container') ||
                activeElement.matches('[data-testid="post_textbox"] *, .post-create__container *'));

        console.log('[Sticker] Active element:', activeElement?.tagName, activeElement?.className);
        console.log('[Sticker] RHS input focused:', isRhsInputFocused);
        console.log('[Sticker] Main input focused:', isMainInputFocused);

        // Handle different formats that might be passed
        let channelId = '';
        let rootId = '';
        if (typeof channelIdOrObject === 'string') {
            channelId = channelIdOrObject;
        } else if (channelIdOrObject && typeof channelIdOrObject === 'object') {
            channelId = channelIdOrObject.id || channelIdOrObject.channel_id || '';
            rootId = channelIdOrObject.root_id || '';
        }

        // Fallback to current channel from state
        if (!channelId) {
            channelId = state.entities?.channels?.currentChannelId || '';
        }

        // CRITICAL FIX: When using RHS selectedPostId as rootId, ensure channelId matches
        // The RHS selectedPostId belongs to a specific channel, not necessarily the current channel
        let rhsChannelId = '';
        if (state.views?.rhs?.selectedPostId) {
            // Try multiple sources for RHS channel ID
            rhsChannelId = (state.views.rhs as any).selectedChannelId ||  // RHS selected channel ID (from thread management)
                (state.views.rhs as any).channelId ||  // Direct RHS channel ID
                (state.views.rhs as any).channel_id ||   // Alternative RHS channel ID
                (state.entities?.posts?.posts?.[state.views.rhs.selectedPostId]?.channel_id) ||  // From post data
                (state.entities?.posts?.posts?.[state.views.rhs.selectedPostId]?.channelId) ||   // Alternative post channel ID
                '';

            console.log('[Sticker] RHS selectedPostId:', state.views.rhs.selectedPostId);
            console.log('[Sticker] RHS selectedChannelId:', (state.views.rhs as any).selectedChannelId);
            console.log('[Sticker] RHS state channelId:', (state.views.rhs as any).channelId);
            console.log('[Sticker] Post channel_id:', state.entities?.posts?.posts?.[state.views.rhs.selectedPostId]?.channel_id);
            console.log('[Sticker] Final RHS channelId:', rhsChannelId);
        }

        // THREAD MANAGEMENT FIX: Check for selected thread in thread management interface
        let threadManagementChannelId = '';
        let threadManagementRootId = '';
        if ((state as any).views?.threads?.selectedThreadIdInTeam) {
            // Get the current team ID (assuming single team for now, or we need to get current team)
            const currentTeamId = Object.keys((state as any).views.threads.selectedThreadIdInTeam)[0];
            let selectedThreadId = (state as any).views.threads.selectedThreadIdInTeam[currentTeamId];

            // If no thread is currently selected, check if we're in thread management interface
            // and use the most recently viewed thread as fallback
            if (!selectedThreadId && (state as any).views?.lhs?.currentStaticPageId === 'threads') {
                const lastViewedThreads = (state as any).views.threads.lastViewedAt;
                if (lastViewedThreads && typeof lastViewedThreads === 'object') {
                    // Find the most recently viewed thread
                    let mostRecentThreadId = '';
                    let mostRecentTime = 0;

                    Object.entries(lastViewedThreads).forEach(([threadId, viewedAt]) => {
                        if (typeof viewedAt === 'number' && viewedAt > mostRecentTime) {
                            mostRecentTime = viewedAt;
                            mostRecentThreadId = threadId;
                        }
                    });

                    if (mostRecentThreadId) {
                        selectedThreadId = mostRecentThreadId;
                        console.log('[Sticker] Using most recently viewed thread as fallback:', selectedThreadId);
                    }
                }
            }

            if (selectedThreadId) {
                threadManagementRootId = selectedThreadId;
                // Get channel ID from thread data (it's in the post field)
                threadManagementChannelId = (state.entities?.threads?.threads?.[selectedThreadId]?.post?.channel_id) ||
                    (state.entities?.threads?.threads?.[selectedThreadId]?.post?.channelId) ||
                    '';

                console.log('[Sticker] Thread management selectedThreadId:', selectedThreadId);
                console.log('[Sticker] Thread management thread data:', (state.entities?.threads?.threads?.[selectedThreadId]));
                console.log('[Sticker] Thread management channelId:', threadManagementChannelId);
            }
        }

        // CONTEXT PRIORITY DETECTION: Determine where sticker should be sent based on context priority
        if (!rootId) {
            // Priority 1: Main thread view (user is viewing thread in main area)
            if ((state as any).views?.thread?.selectedPostId) {
                rootId = (state as any).views.thread.selectedPostId;
                console.log('[Sticker] PRIORITY 1: Main thread view, using rootId:', rootId);
            }
            // Priority 2: RHS in thread mode
            else if (state.views?.rhs?.rhsState === 'thread' && state.views?.rhs?.selectedPostId) {
                rootId = state.views.rhs.selectedPostId;
                // Use RHS channel ID instead of current channel
                if (rhsChannelId) {
                    channelId = rhsChannelId;
                    console.log('[Sticker] PRIORITY 2: RHS thread mode, using channelId:', channelId, 'rootId:', rootId);
                } else {
                    console.log('[Sticker] PRIORITY 2: RHS thread mode, using rootId:', rootId);
                }
            }
            // Priority 3: RHS focused with selected post (even if not in thread mode)
            else if (isRhsInputFocused && state.views?.rhs?.selectedPostId) {
                rootId = state.views.rhs.selectedPostId;
                // Use RHS channel ID instead of current channel
                if (rhsChannelId) {
                    channelId = rhsChannelId;
                    console.log('[Sticker] PRIORITY 3: RHS focused + selected post, using channelId:', channelId, 'rootId:', rootId);
                } else {
                    console.log('[Sticker] PRIORITY 3: RHS focused + selected post, using rootId:', rootId);
                }
            }
            // Priority 4: Thread management interface (selected thread in views.threads)
            else if (threadManagementRootId && !channelId) {
                // Use the thread management selected thread
                rootId = threadManagementRootId;
                if (threadManagementChannelId) {
                    channelId = threadManagementChannelId;
                    console.log('[Sticker] PRIORITY 4: Thread management interface, using channelId:', channelId, 'rootId:', rootId);
                } else {
                    console.log('[Sticker] PRIORITY 4: Thread management interface detected but no channelId available');
                }
            }
            // Priority 5: Thread management interface (RHS has selected post, no current channel, not focused)
            else if (state.views?.rhs?.selectedPostId && !isRhsInputFocused && !channelId) {
                // This is the thread management interface - user selected a thread from global thread list
                rootId = state.views.rhs.selectedPostId;
                // Use the channel ID from RHS state (selectedChannelId)
                if (rhsChannelId) {
                    channelId = rhsChannelId;
                    console.log('[Sticker] PRIORITY 5: Thread management interface (RHS), using channelId:', channelId, 'rootId:', rootId);
                } else {
                    console.log('[Sticker] PRIORITY 5: Thread management interface detected but no channelId available');
                }
            }
            // Priority 6: RHS has selected post but user is not focused there (channel context)
            else if (state.views?.rhs?.selectedPostId && !isRhsInputFocused) {
                console.log('[Sticker] RHS has selected post but not focused - treating as channel context');
            }
            // Default: Channel context
            else {
                console.log('[Sticker] Channel context confirmed - no rootId');
            }
        }

        if (rootId) {
            console.log('[Sticker] Using rootId for thread posting:', rootId);
        } else {
            console.log('[Sticker] No thread context detected, sending to main channel');
        }

        console.log('[Sticker] Final channelId:', channelId, 'rootId:', rootId);

        this.state = {
            pickerVisible: true,
            channelId,
            rootId,
        };

        this.renderPicker(currentUserId);
    }

    private closeStickerPicker(): void {
        if (!this.pickerContainer) return;

        console.log('[Sticker] Closing picker');
        this.state.pickerVisible = false;
        ReactDOM.unmountComponentAtNode(this.pickerContainer);
    }

    private handleStickerSelect(sticker: Sticker): void {
        if (!this.store) return;

        const { channelId, rootId } = this.state;

        console.log('[Sticker] Selected sticker:', sticker.id, sticker.name, { channelId, rootId });

        // Add to recent stickers
        import('./actions/api').then(({ addRecentSticker }) => {
            addRecentSticker(sticker.id);
        });

        // Send sticker via REST API
        this.sendStickerPost(channelId, rootId, sticker);

        this.closeStickerPicker();
    }

    private async sendStickerPost(channelId: string, rootId: string, sticker: Sticker): Promise<void> {
        if (!channelId) {
            console.error('[Sticker] No channelId provided');
            return;
        }

        try {
            // Create post with custom type for StickerPost component
            const postData: any = {
                channel_id: channelId,
                message: sticker.name, // Use sticker name as message
                type: 'custom_sticker',
                props: {
                    sticker_id: sticker.id,
                    sticker_name: sticker.name,
                },
                file_ids: [], // Explicitly empty to prevent any file attachment
            };

            // Include root_id for threads
            if (rootId) {
                postData.root_id = rootId;
            }

            console.log('[Sticker] Sending post with data:', postData);

            const response = await doPost('/api/v4/posts', postData);
            console.log('[Sticker] Post sent successfully:', response);
        } catch (error) {
            console.error('[Sticker] Failed to send sticker:', error);
        }
    }

    private renderPicker(currentUserId: string): void {
        if (!this.pickerContainer) return;

        ReactDOM.render(
            <StickerPicker
                channelId={this.state.channelId}
                onSelect={this.handleStickerSelect.bind(this)}
                onClose={this.closeStickerPicker.bind(this)}
                currentUserId={currentUserId}
            />,
            this.pickerContainer
        );
    }

    public uninitialize(): void {
        if (this.pickerContainer) {
            ReactDOM.unmountComponentAtNode(this.pickerContainer);
            this.pickerContainer.remove();
            this.pickerContainer = null;
        }
    }
}

// Register the plugin
window.registerPlugin(PLUGIN_ID, new Plugin());
