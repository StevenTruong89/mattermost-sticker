package main

import (
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gorilla/mux"
)

func (p *Plugin) initAPI() {
	p.router.HandleFunc("/api/v1/stickers", p.handleGetStickers).Methods(http.MethodGet)
	p.router.HandleFunc("/api/v1/stickers", p.handleCreateSticker).Methods(http.MethodPost)
	p.router.HandleFunc("/api/v1/stickers/bulk", p.handleBulkUpload).Methods(http.MethodPost)
	p.router.HandleFunc("/api/v1/stickers/bulk", p.handleBulkDeleteStickers).Methods(http.MethodDelete)
	p.router.HandleFunc("/api/v1/stickers/from-url", p.handleCreateStickerFromURL).Methods(http.MethodPost)
	p.router.HandleFunc("/api/v1/stickers/{id}", p.handleDeleteSticker).Methods(http.MethodDelete)
	p.router.HandleFunc("/api/v1/stickers/{id}/image", p.handleGetStickerImage).Methods(http.MethodGet)
	p.router.HandleFunc("/api/v1/stickers/search", p.handleSearchStickers).Methods(http.MethodGet)
	p.router.HandleFunc("/api/v1/stickers/by-ids", p.handleGetStickersByIds).Methods(http.MethodGet)
}

func (p *Plugin) handleGetStickers(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	pageStr := r.URL.Query().Get("page")
	perPageStr := r.URL.Query().Get("per_page")

	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}

	perPage, _ := strconv.Atoi(perPageStr)
	if perPageStr == "" {
		perPage = 50 // Default to 50
	}

	list, err := p.GetStickersPage(page, perPage)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (p *Plugin) handleCreateSticker(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	name := r.FormValue("name")
	if name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	if p.IsStickerNameTaken(name) {
		http.Error(w, "Sticker name already exists", http.StatusConflict)
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		http.Error(w, "Image file is required", http.StatusBadRequest)
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowedExts := strings.Split(p.getConfiguration().AllowedFormats, ",")
	isAllowed := false
	for _, allowed := range allowedExts {
		if "."+strings.TrimSpace(allowed) == ext {
			isAllowed = true
			break
		}
	}
	if !isAllowed {
		http.Error(w, "File format not allowed", http.StatusBadRequest)
		return
	}

	maxSize := int64(p.getConfiguration().MaxStickerSize * 1024)
	if header.Size > maxSize {
		http.Error(w, "File size exceeds limit", http.StatusBadRequest)
		return
	}

	fileData, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "Failed to read file", http.StatusInternalServerError)
		return
	}

	channelID := r.FormValue("channel_id")
	if channelID == "" {
		// Find a public channel for uploading stickers (town square)
		teams, appErr := p.API.GetTeamsForUser(userID)
		if appErr != nil || len(teams) == 0 {
			http.Error(w, "Failed to find team", http.StatusInternalServerError)
			return
		}
		// Get town square channel for the first team
		channels, appErr := p.API.GetPublicChannelsForTeam(teams[0].Id, 0, 100)
		if appErr != nil {
			http.Error(w, "Failed to get channels", http.StatusInternalServerError)
			return
		}
		// Find town square
		channelID = ""
		for _, ch := range channels {
			if ch.Name == "town-square" {
				channelID = ch.Id
				break
			}
		}
		if channelID == "" && len(channels) > 0 {
			// Fallback to first public channel
			channelID = channels[0].Id
		}
		if channelID == "" {
			http.Error(w, "No public channel available for upload", http.StatusInternalServerError)
			return
		}
	}

	fileInfo, err := p.UploadStickerImage(fileData, "sticker_"+name+ext, userID, channelID)
	if err != nil {
		http.Error(w, "Failed to upload image: "+err.Error(), http.StatusInternalServerError)
		return
	}

	sticker := NewSticker(name, fileInfo.Id, userID)
	if err := p.SaveSticker(sticker); err != nil {
		http.Error(w, "Failed to save sticker: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(sticker)
}

func (p *Plugin) handleDeleteSticker(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	stickerID := vars["id"]

	canDelete, err := p.CanDeleteSticker(userID, stickerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if !canDelete {
		http.Error(w, "Permission denied: you can only delete your own stickers", http.StatusForbidden)
		return
	}

	if err := p.DeleteSticker(stickerID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (p *Plugin) handleGetStickerImage(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	vars := mux.Vars(r)
	stickerID := vars["id"]

	sticker, err := p.GetSticker(stickerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	var fileData []byte
	var contentType string

	// First try to get from KV store (preferred method)
	fileData, err = p.GetStickerImage(stickerID)
	if err == nil && len(fileData) > 0 {
		// Determine content type from file data
		contentType = detectContentType(fileData)
	} else {
		// Fallback: try to get file from Mattermost API via file info
		if sticker.FileID != "" {
			// Get file info to determine content type
			fileInfo, appErr := p.API.GetFileInfo(sticker.FileID)
			if appErr == nil && fileInfo != nil {
				contentType = fileInfo.MimeType
				// Get file data from Mattermost
				data, appErr := p.API.GetFile(sticker.FileID)
				if appErr == nil && len(data) > 0 {
					fileData = data
				}
			}
		}
	}

	if len(fileData) == 0 {
		http.Error(w, "Sticker image not found", http.StatusNotFound)
		return
	}

	if contentType == "" {
		contentType = "image/png"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=31536000")
	w.Write(fileData)
}

func detectContentType(data []byte) string {
	if len(data) < 4 {
		return "image/png"
	}
	if data[0] == 0xFF && data[1] == 0xD8 {
		return "image/jpeg"
	} else if data[0] == 0x47 && data[1] == 0x49 && data[2] == 0x46 {
		return "image/gif"
	} else if data[0] == 0x89 && data[1] == 0x50 && data[2] == 0x4E && data[3] == 0x47 {
		return "image/png"
	} else if data[0] == 0x52 && data[1] == 0x49 && data[2] == 0x46 && data[3] == 0x46 {
		return "image/webp"
	}
	return "application/octet-stream"
}

func (p *Plugin) handleSearchStickers(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	query := r.URL.Query().Get("q")
	list, err := p.SearchStickers(query)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list)
}

func (p *Plugin) handleCreateStickerFromURL(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Name      string `json:"name"`
		URL       string `json:"url"`
		ChannelID string `json:"channel_id"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Name == "" || req.URL == "" {
		http.Error(w, "Name and URL are required", http.StatusBadRequest)
		return
	}

	if p.IsStickerNameTaken(req.Name) {
		http.Error(w, "Sticker name already exists", http.StatusConflict)
		return
	}

	// Download image from URL
	resp, err := http.Get(req.URL)
	if err != nil {
		http.Error(w, "Failed to download image: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, "Failed to download image: status "+resp.Status, http.StatusBadRequest)
		return
	}

	contentType := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(contentType, "image/") {
		http.Error(w, "URL does not point to an image", http.StatusBadRequest)
		return
	}

	maxSize := int64(p.getConfiguration().MaxStickerSize * 1024)
	fileData, err := io.ReadAll(io.LimitReader(resp.Body, maxSize+1))
	if err != nil {
		http.Error(w, "Failed to read image: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if int64(len(fileData)) > maxSize {
		http.Error(w, "Image size exceeds limit", http.StatusBadRequest)
		return
	}

	uploadChannelID := req.ChannelID
	if uploadChannelID == "" {
		// Find a public channel for uploading stickers (town square)
		teams, appErr := p.API.GetTeamsForUser(userID)
		if appErr != nil || len(teams) == 0 {
			http.Error(w, "Failed to find team", http.StatusInternalServerError)
			return
		}
		// Get town square channel for the first team
		channels, appErr := p.API.GetPublicChannelsForTeam(teams[0].Id, 0, 100)
		if appErr != nil {
			http.Error(w, "Failed to get channels", http.StatusInternalServerError)
			return
		}
		// Find town square
		uploadChannelID = ""
		for _, ch := range channels {
			if ch.Name == "town-square" {
				uploadChannelID = ch.Id
				break
			}
		}
		if uploadChannelID == "" && len(channels) > 0 {
			// Fallback to first public channel
			uploadChannelID = channels[0].Id
		}
		if uploadChannelID == "" {
			http.Error(w, "No public channel available for upload", http.StatusInternalServerError)
			return
		}
	}

	fileInfo, err := p.UploadStickerImage(fileData, "sticker_"+req.Name+".png", userID, uploadChannelID)
	if err != nil {
		http.Error(w, "Failed to upload image: "+err.Error(), http.StatusInternalServerError)
		return
	}

	sticker := NewSticker(req.Name, fileInfo.Id, userID)
	if err := p.SaveSticker(sticker); err != nil {
		http.Error(w, "Failed to save sticker: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(sticker)
}

type BulkUploadResult struct {
	Success []string          `json:"success"`
	Failed  map[string]string `json:"failed"`
}

func (p *Plugin) handleBulkUpload(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// 32MB max for bulk upload
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}

	channelID := r.FormValue("channel_id")
	if channelID == "" {
		// Find a public channel for uploading stickers (town square)
		teams, appErr := p.API.GetTeamsForUser(userID)
		if appErr != nil || len(teams) == 0 {
			http.Error(w, "Failed to find team", http.StatusInternalServerError)
			return
		}
		// Get town square channel for the first team
		channels, appErr := p.API.GetPublicChannelsForTeam(teams[0].Id, 0, 100)
		if appErr != nil {
			http.Error(w, "Failed to get channels", http.StatusInternalServerError)
			return
		}
		// Find town square
		channelID = ""
		for _, ch := range channels {
			if ch.Name == "town-square" {
				channelID = ch.Id
				break
			}
		}
		if channelID == "" && len(channels) > 0 {
			// Fallback to first public channel
			channelID = channels[0].Id
		}
		if channelID == "" {
			http.Error(w, "No public channel available for upload", http.StatusInternalServerError)
			return
		}
	}

	allowedExts := strings.Split(p.getConfiguration().AllowedFormats, ",")
	maxSize := int64(p.getConfiguration().MaxStickerSize * 1024)

	result := BulkUploadResult{
		Success: []string{},
		Failed:  make(map[string]string),
	}

	files := r.MultipartForm.File["images"]
	if len(files) == 0 {
		http.Error(w, "No files provided", http.StatusBadRequest)
		return
	}

	for _, fileHeader := range files {
		filename := fileHeader.Filename
		ext := strings.ToLower(filepath.Ext(filename))
		name := strings.TrimSuffix(filename, ext)

		// Validate extension
		isAllowed := false
		for _, allowed := range allowedExts {
			if "."+strings.TrimSpace(allowed) == ext {
				isAllowed = true
				break
			}
		}
		if !isAllowed {
			result.Failed[filename] = "File format not allowed"
			continue
		}

		// Validate size
		if fileHeader.Size > maxSize {
			result.Failed[filename] = "File size exceeds limit"
			continue
		}

		// Check duplicate name
		if p.IsStickerNameTaken(name) {
			result.Failed[filename] = "Sticker name already exists"
			continue
		}

		// Read file
		file, err := fileHeader.Open()
		if err != nil {
			result.Failed[filename] = "Failed to open file"
			continue
		}

		fileData, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			result.Failed[filename] = "Failed to read file"
			continue
		}

		fileInfo, err := p.UploadStickerImage(fileData, "sticker_"+name+ext, userID, channelID)
		if err != nil {
			result.Failed[filename] = "Failed to upload: " + err.Error()
			continue
		}

		sticker := NewSticker(name, fileInfo.Id, userID)
		if err := p.SaveSticker(sticker); err != nil {
			result.Failed[filename] = "Failed to save: " + err.Error()
			continue
		}

		result.Success = append(result.Success, name)
	}

	w.Header().Set("Content-Type", "application/json")
	if len(result.Failed) > 0 && len(result.Success) == 0 {
		w.WriteHeader(http.StatusBadRequest)
	} else if len(result.Failed) > 0 {
		w.WriteHeader(http.StatusPartialContent)
	} else {
		w.WriteHeader(http.StatusCreated)
	}
	json.NewEncoder(w).Encode(result)
}

type BulkDeleteResult struct {
	Success []string          `json:"success"`
	Failed  map[string]string `json:"failed"`
}

func (p *Plugin) handleBulkDeleteStickers(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Ids []string `json:"ids"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Ids) == 0 {
		http.Error(w, "No sticker IDs provided", http.StatusBadRequest)
		return
	}

	result := BulkDeleteResult{
		Success: []string{},
		Failed:  make(map[string]string),
	}

	for _, id := range req.Ids {
		canDelete, err := p.CanDeleteSticker(userID, id)
		if err != nil {
			result.Failed[id] = "Sticker not found"
			continue
		}

		if !canDelete {
			result.Failed[id] = "Permission denied"
			continue
		}

		if err := p.DeleteSticker(id); err != nil {
			result.Failed[id] = "Failed to delete"
			continue
		}

		result.Success = append(result.Success, id)
	}

	w.Header().Set("Content-Type", "application/json")
	if len(result.Failed) > 0 && len(result.Success) == 0 {
		w.WriteHeader(http.StatusBadRequest)
	} else if len(result.Failed) > 0 {
		w.WriteHeader(http.StatusPartialContent)
	} else {
		w.WriteHeader(http.StatusOK)
	}
	json.NewEncoder(w).Encode(result)
}

func (p *Plugin) handleGetStickersByIds(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	idsStr := r.URL.Query().Get("ids")
	if idsStr == "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(&StickerList{Stickers: []*Sticker{}, Total: 0})
		return
	}

	ids := strings.Split(idsStr, ",")
	stickers, err := p.GetStickersByIds(ids)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(&StickerList{
		Stickers: stickers,
		Total:    len(stickers),
	})
}
