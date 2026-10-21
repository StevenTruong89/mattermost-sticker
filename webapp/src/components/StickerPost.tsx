import React, { useState } from 'react';
import { StickerPostProps } from '../types';
import { getStickerImageUrl } from '../actions/api';

const StickerPost: React.FC<StickerPostProps> = ({ post }) => {
    const { sticker_id, sticker_name } = post.props;
    const [loaded, setLoaded] = useState(false);

    if (!sticker_id) {
        return <div style={styles.invalid}>Invalid sticker</div>;
    }

    const imageUrl = getStickerImageUrl(sticker_id);

    return (
        <div style={styles.container}>
            {!loaded && <div style={styles.placeholder} />}
            <img
                src={imageUrl}
                alt={sticker_name || 'Sticker'}
                style={{
                    ...styles.image,
                    opacity: loaded ? 1 : 0,
                }}
                loading="lazy"
                onLoad={() => setLoaded(true)}
            />
        </div>
    );
};

const styles: Record<string, React.CSSProperties> = {
    container: {
        display: 'inline-flex',
        position: 'relative',
        maxWidth: '200px',
        minHeight: '60px',
    },
    placeholder: {
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(var(--center-channel-color-rgb), 0.04)',
        borderRadius: '8px',
        animation: 'pulse 1.5s ease-in-out infinite',
    },
    image: {
        maxWidth: '100%',
        maxHeight: '200px',
        objectFit: 'contain',
        borderRadius: '8px',
        transition: 'opacity 0.2s ease',
    },
    invalid: {
        padding: '8px 12px',
        fontSize: '13px',
        color: 'rgba(var(--center-channel-color-rgb), 0.56)',
        fontStyle: 'italic',
    },
};

// Add pulse animation
const pulseStyles = document.createElement('style');
pulseStyles.textContent = `
@keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
}
`;
if (!document.getElementById('sp-pulse-keyframes')) {
    pulseStyles.id = 'sp-pulse-keyframes';
    document.head.appendChild(pulseStyles);
}

export default StickerPost;
