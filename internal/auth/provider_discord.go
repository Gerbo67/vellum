package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/loomtek/vellum/internal/domain"
	"golang.org/x/oauth2"
)

var discordEndpoint = oauth2.Endpoint{
	AuthURL:  "https://discord.com/api/oauth2/authorize",
	TokenURL: "https://discord.com/api/oauth2/token",
}

type discordProvider struct{}

func newDiscordProvider(cfg domain.AuthProviderConfig, baseURL string) (provider, *oauth2.Config) {
	o2cfg := &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     discordEndpoint,
		RedirectURL:  baseURL + "/api/auth/discord/callback",
		Scopes:       []string{"identify", "email"},
	}
	return &discordProvider{}, o2cfg
}

func (d *discordProvider) needsNonce() bool { return false }

func (d *discordProvider) buildAuthURL(o2cfg *oauth2.Config, state, _ string) string {
	return o2cfg.AuthCodeURL(state)
}

func (d *discordProvider) exchange(ctx context.Context, o2cfg *oauth2.Config, code, _ string) (*userInfo, error) {
	tok, err := o2cfg.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("discord: exchange code: %w", err)
	}

	client := o2cfg.Client(ctx, tok)
	resp, err := client.Get("https://discord.com/api/users/@me")
	if err != nil {
		return nil, fmt.Errorf("discord: users/@me: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("discord: users/@me: status %d", resp.StatusCode)
	}

	var u struct {
		ID            string `json:"id"`
		Username      string `json:"username"`
		GlobalName    string `json:"global_name"`
		Email         string `json:"email"`
		Verified      bool   `json:"verified"`
		Discriminator string `json:"discriminator"`
	}
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, fmt.Errorf("discord: parse user: %w", err)
	}

	name := u.GlobalName
	if name == "" {
		name = u.Username
		if u.Discriminator != "" && u.Discriminator != "0" {
			name += "#" + u.Discriminator
		}
	}

	return &userInfo{
		ProviderID: u.ID,
		Email:      u.Email,
		Name:       name,
		Username:   u.Username,
	}, nil
}
