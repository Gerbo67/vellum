package config

import (
	"os"
	"strconv"
)

// Config holds the runtime parameters loaded from environment variables.
type Config struct {
	Port             int
	SMTPPort         int
	DBPath           string
	JWTSecret        string
	BaseURL          string
	MaxEmailSize     int64
	OIDCIssuer       string
	OIDCClientID     string
	OIDCClientSecret string
	// OAuth2 provider credentials loaded from environment at startup.
	// These serve as defaults; the admin can override them in the database.
	GitHubClientID     string
	GitHubClientSecret string
	GoogleClientID     string
	GoogleClientSecret string
	DiscordClientID    string
	DiscordClientSecret string
}

// Load reads configuration from environment variables, applying sensible defaults
// for local development when a variable is not set.
func Load() (*Config, error) {
	cfg := &Config{
		Port:                getEnvInt("VELLUM_PORT", 8025),
		SMTPPort:            getEnvInt("VELLUM_SMTP_PORT", 2525),
		DBPath:              getEnvStr("VELLUM_DB_PATH", "/data/vellum.db"),
		JWTSecret:           getEnvStr("VELLUM_JWT_SECRET", ""),
		BaseURL:             getEnvStr("VELLUM_BASE_URL", "http://localhost:8025"),
		MaxEmailSize:        getEnvInt64("VELLUM_MAX_EMAIL_SIZE", 26214400),
		OIDCIssuer:          getEnvStr("OIDC_ISSUER", ""),
		OIDCClientID:        getEnvStr("OIDC_CLIENT_ID", ""),
		OIDCClientSecret:    getEnvStr("OIDC_CLIENT_SECRET", ""),
		GitHubClientID:      getEnvStr("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret:  getEnvStr("GITHUB_CLIENT_SECRET", ""),
		GoogleClientID:      getEnvStr("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret:  getEnvStr("GOOGLE_CLIENT_SECRET", ""),
		DiscordClientID:     getEnvStr("DISCORD_CLIENT_ID", ""),
		DiscordClientSecret: getEnvStr("DISCORD_CLIENT_SECRET", ""),
	}
	// An empty JWTSecret means no secret was provided via environment.
	// resolveJWTSecret() in main.go is solely responsible for generating
	// and persisting a secret in the database so it survives restarts.
	return cfg, nil
}

// OIDCEnabled reports whether the three required OIDC parameters are configured.
func (c *Config) OIDCEnabled() bool {
	return c.OIDCIssuer != "" && c.OIDCClientID != "" && c.OIDCClientSecret != ""
}

func getEnvStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getEnvInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return def
}

func getEnvInt64(key string, def int64) int64 {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err == nil {
			return n
		}
	}
	return def
}
