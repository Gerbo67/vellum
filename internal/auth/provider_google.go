package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"

	"github.com/loomtek/vellum/internal/domain"
	"golang.org/x/oauth2"
	googleoauth "golang.org/x/oauth2/google"
)

type googleProvider struct{}

func newGoogleProvider(cfg domain.AuthProviderConfig, baseURL string) (provider, *oauth2.Config) {
	o2cfg := &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     googleoauth.Endpoint,
		RedirectURL:  baseURL + "/api/auth/google/callback",
		Scopes:       []string{"openid", "profile", "email"},
	}
	return &googleProvider{}, o2cfg
}

func (g *googleProvider) needsNonce() bool { return false }

func (g *googleProvider) buildAuthURL(o2cfg *oauth2.Config, state, _ string) string {
	return o2cfg.AuthCodeURL(state, oauth2.AccessTypeOnline)
}

func (g *googleProvider) exchange(ctx context.Context, o2cfg *oauth2.Config, code, _ string) (*userInfo, error) {
	tok, err := o2cfg.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("google: exchange code: %w", err)
	}

	client := o2cfg.Client(ctx, tok)
	resp, err := client.Get("https://openidconnect.googleapis.com/v1/userinfo")
	if err != nil {
		return nil, fmt.Errorf("google: userinfo: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("google: userinfo: status %d", resp.StatusCode)
	}

	var claims struct {
		Sub   string `json:"sub"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}
	if err := json.Unmarshal(body, &claims); err != nil {
		return nil, fmt.Errorf("google: parse userinfo: %w", err)
	}

	return &userInfo{
		ProviderID: claims.Sub,
		Email:      claims.Email,
		Name:       claims.Name,
	}, nil
}
