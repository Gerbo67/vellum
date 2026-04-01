package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/loomtek/vellum/internal/auth"
	"github.com/loomtek/vellum/internal/config"
	"github.com/loomtek/vellum/internal/domain"
	vlog "github.com/loomtek/vellum/internal/logger"
	"github.com/loomtek/vellum/internal/server"
	vsmtp "github.com/loomtek/vellum/internal/smtp"
	"github.com/loomtek/vellum/internal/storage"
)

//go:embed dist
var embeddedFiles embed.FS

func main() {
	vlog.Setup()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("config load failed", "error", err.Error())
		os.Exit(1)
	}

	db, err := storage.Open(cfg.DBPath)
	if err != nil {
		slog.Error("database open failed", "path", cfg.DBPath, "error", err.Error())
		os.Exit(1)
	}
	defer db.Close()

	tokens := auth.NewTokenManager(db, resolveJWTSecret(db, cfg.JWTSecret))
	authSvc, err := auth.NewService(db, tokens, cfg)
	if err != nil {
		slog.Error("auth service init failed", "error", err.Error())
		os.Exit(1)
	}

	staticFS, err := fs.Sub(embeddedFiles, "dist")
	if err != nil {
		slog.Error("static fs init failed", "error", err.Error())
		os.Exit(1)
	}

	srv := server.New(cfg, db, authSvc, tokens, staticFS)

	smtpSrv := vsmtp.NewServer(
		getAddr(cfg.SMTPPort),
		db,
		cfg.MaxEmailSize,
		srv,
	)

	go func() {
		slog.Info("smtp server listening", "port", cfg.SMTPPort)
		if err := smtpSrv.ListenAndServe(); err != nil {
			slog.Error("smtp server failed", "error", err.Error())
			os.Exit(1)
		}
	}()

	go cleanupExpiredFamilies(db)

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		if err := srv.Start(); err != nil {
			slog.Error("http server failed", "error", err.Error())
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down")
	smtpSrv.Close()
}

func getAddr(port int) string {
	return ":" + itoa(port)
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	buf := [20]byte{}
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[pos:])
}

func generateSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func cleanupExpiredFamilies(db *storage.DB) {
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		if err := db.CleanExpiredFamilies(); err != nil {
			slog.Warn("cleanup expired families failed", "error", err.Error())
		}
	}
}

// resolveJWTSecret returns envSecret if set, otherwise loads it from the database.
// If neither exists, a new secret is generated and persisted so it survives restarts.
func resolveJWTSecret(db *storage.DB, envSecret string) string {
	if envSecret != "" {
		return envSecret
	}
	cfg, err := db.GetConfig()
	if err == nil && cfg.JWTSecret != "" {
		return cfg.JWTSecret
	}
	secret, err := generateSecret()
	if err != nil {
		slog.Error("failed to generate jwt secret", "error", err.Error())
		os.Exit(1)
	}
	if cfg == nil {
		cfg = &domain.AppConfig{}
	}
	cfg.JWTSecret = secret
	if err := db.SaveConfig(cfg); err != nil {
		slog.Warn("failed to persist jwt secret", "error", err.Error())
	}
	return secret
}

