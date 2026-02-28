.PHONY: all clean build dist server webapp check-style

PLUGIN_ID ?= com.example.sticker
PLUGIN_VERSION ?= 1.5.7

GOOS ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

GO_BUILD_FLAGS = -ldflags '-w -s'

all: dist

clean:
	rm -rf dist
	rm -rf server/dist
	rm -rf webapp/dist
	rm -rf webapp/node_modules

## Server

server:
	mkdir -p server/dist
	cd server && \
	GOOS=linux GOARCH=amd64 go build $(GO_BUILD_FLAGS) -o dist/plugin-linux-amd64 . && \
	GOOS=linux GOARCH=arm64 go build $(GO_BUILD_FLAGS) -o dist/plugin-linux-arm64 . && \
	GOOS=darwin GOARCH=amd64 go build $(GO_BUILD_FLAGS) -o dist/plugin-darwin-amd64 . && \
	GOOS=darwin GOARCH=arm64 go build $(GO_BUILD_FLAGS) -o dist/plugin-darwin-arm64 . && \
GOOS=windows GOARCH=amd64 go build $(GO_BUILD_FLAGS) -o dist/plugin-windows-amd64.exe .
	chmod +x dist/*

server-local:
	mkdir -p server/dist
	cd server && go build $(GO_BUILD_FLAGS) -o dist/plugin-$(GOOS)-$(GOARCH) .

## Webapp

webapp:
	cd webapp && npm install && npm run build

## Distribution

dist: server webapp
	mkdir -p dist/$(PLUGIN_ID)
	cp plugin.json dist/$(PLUGIN_ID)/
	cp -r server/dist dist/$(PLUGIN_ID)/server
	chmod +x dist/$(PLUGIN_ID)/server/dist/*
	mkdir -p dist/$(PLUGIN_ID)/webapp/dist
	cp webapp/dist/main.js dist/$(PLUGIN_ID)/webapp/dist/
	cd dist && tar --mode='755' -cvzf $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz $(PLUGIN_ID)
	@echo "Plugin package created: dist/$(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz"
	@echo "To increment the version, run: make increment-version"

dist-local: server-local webapp

increment-version:
	@echo "Current version: $(PLUGIN_VERSION)"
	@echo "Enter new version (e.g., 0.2.4): " && read -p "" NEW_VERSION && \
	if [ -n "$$NEW_VERSION" ]; then \
		sed -i "s/PLUGIN_VERSION ?= .*/PLUGIN_VERSION ?= $$NEW_VERSION/" Makefile && \
		echo "Version updated to: $$NEW_VERSION"; \
	else \
		echo "No version provided. Aborting."; \
	fi
	mkdir -p dist/$(PLUGIN_ID)
	cp plugin.json dist/$(PLUGIN_ID)/
	mkdir -p dist/$(PLUGIN_ID)/server/dist
	cp server/dist/plugin-$(GOOS)-$(GOARCH)* dist/$(PLUGIN_ID)/server/dist/
	mkdir -p dist/$(PLUGIN_ID)/webapp/dist
	cp webapp/dist/main.js dist/$(PLUGIN_ID)/webapp/dist/
	cd dist && tar -cvzf $(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz $(PLUGIN_ID)
	@echo "Plugin package created: dist/$(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz"

## Development

watch-webapp:
	cd webapp && npm run dev

## Deploy (requires MM_SERVICESETTINGS_SITEURL and MM_ADMIN_TOKEN environment variables)

deploy: dist
	@if [ -z "$(MM_SERVICESETTINGS_SITEURL)" ]; then \
		echo "Error: MM_SERVICESETTINGS_SITEURL is not set"; \
		exit 1; \
	fi
	@if [ -z "$(MM_ADMIN_TOKEN)" ]; then \
		echo "Error: MM_ADMIN_TOKEN is not set"; \
		exit 1; \
	fi
	curl -F "plugin=@dist/$(PLUGIN_ID)-$(PLUGIN_VERSION).tar.gz" \
		-H "Authorization: Bearer $(MM_ADMIN_TOKEN)" \
		$(MM_SERVICESETTINGS_SITEURL)/api/v4/plugins
	curl -X POST \
		-H "Authorization: Bearer $(MM_ADMIN_TOKEN)" \
		$(MM_SERVICESETTINGS_SITEURL)/api/v4/plugins/$(PLUGIN_ID)/enable

## Help

help:
	@echo "Mattermost Custom Sticker Plugin"
	@echo ""
	@echo "Usage:"
	@echo "  make all        - Build everything and create distribution package"
	@echo "  make server     - Build server component for all platforms"
	@echo "  make webapp     - Build webapp component"
	@echo "  make dist       - Create distribution package"
	@echo "  make dist-local - Create distribution package for current platform only"
	@echo "  make deploy     - Deploy to Mattermost server (requires env vars)"
	@echo "  make clean      - Clean build artifacts"
	@echo "  make help       - Show this help message"
