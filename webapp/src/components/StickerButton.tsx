import React from 'react';

interface StickerButtonProps {
    onClick: () => void;
}

const StickerButton: React.FC<StickerButtonProps> = ({ onClick }) => {
    return (
        <button
            onClick={onClick}
            style={styles.button}
            title="Stickers"
            aria-label="Open sticker picker"
        >
            <StickerIcon />
        </button>
    );
};

const StickerIcon: React.FC = () => (
    <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
    >
        <path
            d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z"
            fill="currentColor"
        />
        <path
            d="M8.5 11C9.33 11 10 10.33 10 9.5C10 8.67 9.33 8 8.5 8C7.67 8 7 8.67 7 9.5C7 10.33 7.67 11 8.5 11Z"
            fill="currentColor"
        />
        <path
            d="M15.5 11C16.33 11 17 10.33 17 9.5C17 8.67 16.33 8 15.5 8C14.67 8 14 8.67 14 9.5C14 10.33 14.67 11 15.5 11Z"
            fill="currentColor"
        />
        <path
            d="M12 17.5C14.33 17.5 16.31 16.04 17.11 14H6.89C7.69 16.04 9.67 17.5 12 17.5Z"
            fill="currentColor"
        />
    </svg>
);

const styles: { [key: string]: React.CSSProperties } = {
    button: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '8px',
        borderRadius: '4px',
        color: 'rgba(61, 60, 64, 0.56)',
        transition: 'color 0.2s, background-color 0.2s',
    },
};

export { StickerIcon };
export default StickerButton;
