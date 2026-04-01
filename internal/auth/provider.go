package auth

import (
	"context"

	"golang.org/x/oauth2"
)

// userInfo holds the normalized identity information returned by any OAuth2/OIDC provider.
type userInfo struct {
	ProviderID string // stable external identifier (user ID, OIDC sub, etc.)
	Email      string
	Name       string
	Username   string // login name — GitHub / Discord only
}

// provider is the internal interface that each OAuth2/OIDC provider implements.
type provider interface {
	// needsNonce reports whether this provider requires an OIDC nonce.
	needsNonce() bool
	// buildAuthURL constructs the authorization redirect URL.
	buildAuthURL(o2cfg *oauth2.Config, state, nonce string) string
	// exchange completes the authorization code exchange and returns normalized user info.
	exchange(ctx context.Context, o2cfg *oauth2.Config, code, nonce string) (*userInfo, error)
}
