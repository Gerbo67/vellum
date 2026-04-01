package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/loomtek/vellum/internal/domain"
	"golang.org/x/oauth2"
	githuboauth "golang.org/x/oauth2/github"
)

type githubProvider struct{}

func newGitHubProvider(cfg domain.AuthProviderConfig, baseURL string) (provider, *oauth2.Config) {
	o2cfg := &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		Endpoint:     githuboauth.Endpoint,
		RedirectURL:  baseURL + "/api/auth/github/callback",
		Scopes:       []string{"read:user", "user:email"},
	}
	return &githubProvider{}, o2cfg
}

func (g *githubProvider) needsNonce() bool { return false }

func (g *githubProvider) buildAuthURL(o2cfg *oauth2.Config, state, _ string) string {
	return o2cfg.AuthCodeURL(state)
}

func (g *githubProvider) exchange(ctx context.Context, o2cfg *oauth2.Config, code, _ string) (*userInfo, error) {
	tok, err := o2cfg.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("github: exchange code: %w", err)
	}

	client := o2cfg.Client(ctx, tok)

	// Fetch user profile.
	type ghUser struct {
		ID    int    `json:"id"`
		Login string `json:"login"`
		Name  string `json:"name"`
		Email string `json:"email"`
	}
	var gu ghUser
	if err := githubGet(client, "https://api.github.com/user", &gu); err != nil {
		return nil, err
	}

	email := gu.Email
	if email == "" {
		// Fetch primary verified email separately.
		type ghEmail struct {
			Email    string `json:"email"`
			Primary  bool   `json:"primary"`
			Verified bool   `json:"verified"`
		}
		var emails []ghEmail
		if err := githubGet(client, "https://api.github.com/user/emails", &emails); err == nil {
			for _, e := range emails {
				if e.Primary && e.Verified {
					email = e.Email
					break
				}
			}
		}
	}

	name := gu.Name
	if name == "" {
		name = gu.Login
	}

	return &userInfo{
		ProviderID: strconv.Itoa(gu.ID),
		Email:      email,
		Name:       name,
		Username:   gu.Login,
	}, nil
}

func githubGet(client *http.Client, url string, dst interface{}) error {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("github: GET %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("github: GET %s: status %d", url, resp.StatusCode)
	}
	return json.Unmarshal(body, dst)
}
