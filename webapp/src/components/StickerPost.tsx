import React from 'react';
import { StickerPostProps } from '../types';
import { getStickerImageUrl } from '../actions/api';

const StickerPost: React.FC<StickerPostProps> = ({ post }) => {
    const { sticker_id, sticker_name } = post.props;

    if (!sticker_id) {
        return <div>Invalid sticker</div>;
    }

    const imageUrl = getStickerImageUrl(sticker_id);

    return (
        <div className="sticker-post" style={styles.container}>
            <img
                src={imageUrl}
                alt={sticker_name || 'Sticker'}
                style={styles.image}
                loading="lazy"
            />
        </div>
    );
};

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        display: 'inline-block',
        maxWidth: '200px',
        maxHeight: '200px',
    },
    image: {
        maxWidth: '100%',
        maxHeight: '200px',
        objectFit: 'contain',
        borderRadius: '4px',
    },
};

export default StickerPost;
