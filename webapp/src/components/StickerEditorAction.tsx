import React from 'react';
import { StickerIcon } from './StickerButton';

interface StickerEditorActionProps {
    draft?: {
        channelId?: string;
        rootId?: string;
    };
    onOpen: (channelId: string, rootId: string) => void;
}

// Same look and hover/active behaviour as the native editor icons
// (see IconContainer in the Mattermost web app formatting bar).
const STYLE_ID = 'sticker-editor-action-styles';

const style = document.createElement('style');
style.id = STYLE_ID;
style.textContent = `
    .sticker-editor-action {
        display: flex;
        min-width: 32px;
        height: 32px;
        place-items: center;
        place-content: center;
        padding: 0 7px;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: rgba(var(--center-channel-color-rgb), var(--icon-opacity, 0.75));
        cursor: pointer;
        opacity: 1;
    }
    .sticker-editor-action:hover {
        background: rgba(var(--center-channel-color-rgb), 0.08);
        color: rgba(var(--center-channel-color-rgb), var(--icon-opacity-hover, 0.88));
    }
    .sticker-editor-action:active {
        background: rgba(var(--button-bg-rgb), 0.08);
        color: var(--button-bg);
    }
`;

if (!document.getElementById(STYLE_ID)) {
    document.head.appendChild(style);
}

const StickerEditorAction: React.FC<StickerEditorActionProps> = ({ draft, onOpen }) => {
    const channelId = draft?.channelId || '';
    const rootId = draft?.rootId || '';

    // Keep the focus in the message textbox when the button is pressed.
    const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
    };

    return (
        <button
            type='button'
            className='sticker-editor-action'
            onMouseDown={handleMouseDown}
            onClick={() => onOpen(channelId, rootId)}
            title='Stickers'
            aria-label='Select sticker'
        >
            <StickerIcon />
        </button>
    );
};

export default StickerEditorAction;
