package main

import (
	"net/http"
	"sync"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

type Plugin struct {
	plugin.MattermostPlugin

	configurationLock sync.RWMutex
	configuration     *configuration

	router *mux.Router
}

type configuration struct {
	MaxStickerSize int
	AllowedFormats string
}

func (p *Plugin) OnActivate() error {
	p.router = mux.NewRouter()
	p.initAPI()

	if err := p.registerCommand(); err != nil {
		return err
	}

	return nil
}

func (p *Plugin) OnDeactivate() error {
	return nil
}

func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

func (p *Plugin) getConfiguration() *configuration {
	p.configurationLock.RLock()
	defer p.configurationLock.RUnlock()

	if p.configuration == nil {
		return &configuration{
			MaxStickerSize: 1024,
			AllowedFormats: "png,gif,jpg,jpeg,webp",
		}
	}

	return p.configuration
}

func (p *Plugin) OnConfigurationChange() error {
	var cfg configuration

	if err := p.API.LoadPluginConfiguration(&cfg); err != nil {
		return err
	}

	p.configurationLock.Lock()
	p.configuration = &cfg
	p.configurationLock.Unlock()

	return nil
}

func (p *Plugin) registerCommand() error {
	return p.API.RegisterCommand(&model.Command{
		Trigger:          "sticker",
		DisplayName:      "Sticker",
		Description:      "Send or manage custom stickers",
		AutoComplete:     true,
		AutoCompleteDesc: "Send a sticker or manage stickers",
		AutoCompleteHint: "[name] | add [name] | delete [name] | list",
	})
}

func main() {
	plugin.ClientMain(&Plugin{})
}
