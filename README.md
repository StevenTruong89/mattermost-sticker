# Mattermost Custom Sticker Plugin
fork: https://github.com/jaehyun-ko/mattermost-plugin-sticker
[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/StevenTruong89/mattermost-plugin-sticker)
[![Mattermost](https://img.shields.io/badge/mattermost-%3E%3D7.0.0-red.svg)](https://mattermost.com)
[![License](https://img.shields.io/badge/license-Apache%202.0-orange.svg)](LICENSE)

A high-performance custom sticker plugin for Mattermost. Share stickers instantly across your team without the overhead of uploading images for every message. Optimized for large collections with infinite scrolling and backend pagination.

## 🚀 Key Features

### 🎨 Stunning UI & UX
*   **Sticker Picker**: A beautiful, premium UI accessible directly from the message input area.
*   **Infinite Scrolling**: (New in v1.5.0) Smoothly browse thousands of stickers without lag, thanks to `IntersectionObserver` and virtualization.
*   **Recent Stickers**: Your most-used stickers are always at your fingertips (stored locally).
*   **Filtered Views**: Quickly switch between **Recent**, **All Stickers**, and **My Stickers**.
*   **Smart Search**: Real-time debounced search to find exactly what you need.

### 🛠 Powerful Management
*   **Bulk Upload**: Select multiple files at once. The plugin automatically generates names from filenames.
*   **Bulk Delete**: Clean up your collection quickly with multi-select deletion.
*   **Drag & Drop**: Effortlessly add new stickers by dragging files into the upload zone.
*   **Permissions**: Users can upload freely; deletion is restricted to the sticker creator.

### ⚙️ Technical Excellence
*   **Performance Optimized**: Backend pagination (`page`, `per_page`) minimizes data transfer.
*   **Thread Support**: Full compatibility with Mattermost threads (RHS) and main channel views.
*   **Multi-Platform**: Binaries available for Linux (AMD64/ARM64), Darwin, and Windows.
*   **Efficient Persistence**: Uses Mattermost KV store for metadata, ensuring fast retrieval.

## 📥 Installation

### Requirements
*   **Mattermost Server**: 7.0.0 or later
*   **Operating System**: Linux (AMD64/ARM64 recommended for server)

### Step-by-Step Installation
1.  Download the latest release: `com.example.sticker-1.5.0.tar.gz`.
2.  Go to **System Console > Plugins > Plugin Management**.
3.  Upload the `.tar.gz` bundle.
4.  Navigate to **Custom Sticker** settings and ensure it is **Enabled**.

## 🔧 Configuration

Access settings via **System Console > Plugins > Custom Sticker**:

| Setting | Default | Description |
| :--- | :--- | :--- |
| **Max Sticker Size** | 1024 KB | Maximum allowed file size per sticker. |
| **Allowed Formats** | `png,gif,jpg,jpeg,webp` | Permitted image extensions. |

## ⌨️ Slash Commands

| Command | Action |
| :--- | :--- |
| `/sticker [name]` | Sends the specified sticker to the current channel/thread. |
| `/sticker list` | Opens the sticker list view. |
| `/sticker add` | Displays instructions for adding new stickers. |
| `/sticker delete [name]` | Deletes a sticker you created. |
| `/sticker help` | Shows comprehensive command help. |

## 🌐 REST API

Developers can interact with the plugin via these endpoints:

| Endpoint | Method | Parameters | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/stickers` | `GET` | `page`, `per_page` | Paginated list of all stickers. |
| `/api/v1/stickers` | `POST` | `multipart/form` | Upload a new sticker. |
| `/api/v1/stickers/{id}` | `DELETE` | - | Remove a sticker. |
| `/api/v1/stickers/{id}/image`| `GET` | - | Fetch the raw sticker image. |
| `/api/v1/stickers/search` | `GET` | `q` | Search stickers by name. |

## 🛠 Development

### Setup
```bash
# Clone the repository
git clone https://github.com/StevenTruong89/mattermost-plugin-sticker.git
cd mattermost-plugin-sticker

# Install dependencies
cd webapp && npm install
```

### Build Commands
```bash
# Build everything (server + webapp)
make all

# Build for current OS only
make dist-local

# Clean build artifacts
make clean
```

### Automated Deployment
Set your environment variables to deploy directly to a dev server:
```bash
export MM_SERVICESETTINGS_SITEURL=http://your-mattermost-url:8065
export MM_ADMIN_TOKEN=your-personal-access-token
make deploy
```

## 🏗 Project Architecture

*   **`/server`**: Written in Go. Handles API routing, KV Store persistence, and slash command logic.
*   **`/webapp`**: Built with React & TypeScript. Features a custom `useVirtualization` hook and `IntersectionObserver` for heavy-duty UI performance.
*   **`plugin.json`**: The manifest defining plugin capabilities and entry points.

## 📄 License
This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.

---
*Maintained by [Steven Truong](https://github.com/StevenTruong89)*
