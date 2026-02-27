export interface Sticker {
    id: string;
    name: string;
    file_id: string;
    creator_id: string;
    created_at: number;
}

export interface StickerList {
    stickers: Sticker[];
    total: number;
}

export interface PluginRegistry {
    registerPostTypeComponent(type: string, component: React.ComponentType<any>): void;
    registerChannelHeaderButtonAction(
        icon: React.ReactNode,
        action: (channelId: string) => void,
        dropdownText: string,
        tooltipText?: string
    ): void;
    registerRootComponent(component: React.ComponentType<any>): void;
    unregisterComponent(componentId: string): void;
}

export interface Store {
    dispatch: (action: any) => void;
    getState: () => any;
}

export interface StickerPostProps {
    post: {
        id: string;
        props: {
            sticker_id: string;
            sticker_name: string;
            file_id: string;
        };
    };
}
