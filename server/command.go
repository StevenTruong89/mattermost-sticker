package main

import (
	"fmt"
	"strings"

	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

func (p *Plugin) ExecuteCommand(c *plugin.Context, args *model.CommandArgs) (*model.CommandResponse, error) {
	parts := strings.Fields(args.Command)
	if len(parts) < 1 {
		return p.showHelp(), nil
	}

	if len(parts) == 1 {
		return p.listStickers()
	}

	subcommand := parts[1]

	switch subcommand {
	case "list":
		return p.listStickers()
	case "add":
		if len(parts) < 3 {
			return p.respondEphemeral("Usage: /sticker add [name] (attach an image to the message)"), nil
		}
		return p.addStickerHelp(parts[2])
	case "delete":
		if len(parts) < 3 {
			return p.respondEphemeral("Usage: /sticker delete [name]"), nil
		}
		return p.deleteSticker(args.UserId, parts[2])
	case "help":
		return p.showHelp(), nil
	default:
		return p.sendSticker(args.ChannelId, args.UserId, args.RootId, subcommand)
	}
}

func (p *Plugin) showHelp() *model.CommandResponse {
	helpText := `**Sticker Commands**

| Command | Description |
|---------|-------------|
| /sticker [name] | Send a sticker |
| /sticker list | Show all available stickers |
| /sticker add [name] | Instructions to add a new sticker |
| /sticker delete [name] | Delete your sticker |
| /sticker help | Show this help message |

**Tip**: Use the sticker picker button in the message input area for a visual selection!`

	return p.respondEphemeral(helpText)
}

func (p *Plugin) listStickers() (*model.CommandResponse, error) {
	list, err := p.GetAllStickers()
	if err != nil {
		return p.respondEphemeral("Failed to get stickers: " + err.Error()), nil
	}

	if len(list.Stickers) == 0 {
		return p.respondEphemeral("No stickers available. Use the sticker picker to add new stickers!"), nil
	}

	var sb strings.Builder
	sb.WriteString("**Available Stickers**\n\n")

	for _, s := range list.Stickers {
		sb.WriteString(fmt.Sprintf("- `%s`\n", s.Name))
	}

	sb.WriteString(fmt.Sprintf("\nTotal: %d stickers", len(list.Stickers)))

	return p.respondEphemeral(sb.String()), nil
}

func (p *Plugin) sendSticker(channelID, userID, rootID, name string) (*model.CommandResponse, error) {
	sticker, err := p.GetStickerByName(name)
	if err != nil {
		return p.respondEphemeral(fmt.Sprintf("Sticker '%s' not found. Use `/sticker list` to see available stickers.", name)), nil
	}

	_, err = p.CreateStickerPost(channelID, userID, sticker.ID, rootID)
	if err != nil {
		return p.respondEphemeral("Failed to send sticker: " + err.Error()), nil
	}

	return &model.CommandResponse{}, nil
}

func (p *Plugin) addStickerHelp(name string) (*model.CommandResponse, error) {
	if p.IsStickerNameTaken(name) {
		return p.respondEphemeral(fmt.Sprintf("Sticker name '%s' is already taken. Please choose a different name.", name)), nil
	}

	helpText := fmt.Sprintf(`**Adding Sticker: %s**

To add a new sticker, use the **Sticker Picker** button in the message input area:

1. Click the sticker button (next to emoji picker)
2. Click "Add Sticker"
3. Enter the name: **%s**
4. Select your image file
5. Click "Upload"

Supported formats: %s
Maximum size: %d KB`, name, name, p.getConfiguration().AllowedFormats, p.getConfiguration().MaxStickerSize)

	return p.respondEphemeral(helpText), nil
}

func (p *Plugin) deleteSticker(userID, name string) (*model.CommandResponse, error) {
	sticker, err := p.GetStickerByName(name)
	if err != nil {
		return p.respondEphemeral(fmt.Sprintf("Sticker '%s' not found.", name)), nil
	}

	canDelete, err := p.CanDeleteSticker(userID, sticker.ID)
	if err != nil {
		return p.respondEphemeral("Error checking permissions: " + err.Error()), nil
	}

	if !canDelete {
		return p.respondEphemeral("You can only delete stickers that you created."), nil
	}

	if err := p.DeleteSticker(sticker.ID); err != nil {
		return p.respondEphemeral("Failed to delete sticker: " + err.Error()), nil
	}

	return p.respondEphemeral(fmt.Sprintf("Sticker '%s' has been deleted.", name)), nil
}

func (p *Plugin) respondEphemeral(message string) *model.CommandResponse {
	return &model.CommandResponse{
		ResponseType: model.CommandResponseTypeEphemeral,
		Text:         message,
	}
}
