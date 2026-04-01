package logger

import (
	"log/slog"
	"os"
	"strings"
)

// LevelSecurity is a custom log level equal to slog.LevelError (8).
// Security events are emitted at ERROR level with an additional event=SECURITY
// attribute, ensuring visibility even when LOG_LEVEL is set to error.
const LevelSecurity = slog.LevelError

// Setup initializes the global logger based on LOG_LEVEL and LOG_FORMAT
// environment variables.
//
// LOG_LEVEL: debug | info (default) | warn | error
//
//	debug  -> all: debug, info, warn, error, security
//	info   -> info, warn, error, security  (default)
//	warn   -> warn, error, security
//	error  -> errors and security events only
//
// LOG_FORMAT: text (default) | json
//
//	text   -> human-readable, suitable for console and docker logs
//	json   -> structured, suitable for aggregators (Loki, ELK, Datadog)
func Setup() {
	level := parseLevel(os.Getenv("LOG_LEVEL"))
	opts := &slog.HandlerOptions{Level: level}

	var handler slog.Handler
	if strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT"))) == "json" {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}

	slog.SetDefault(slog.New(handler))
	slog.Info("logger ready", "level", level.String(), "format", logFormat())
}

func parseLevel(s string) slog.Level {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "debug":
		return slog.LevelDebug
	case "warn", "warning":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

func logFormat() string {
	if strings.ToLower(strings.TrimSpace(os.Getenv("LOG_FORMAT"))) == "json" {
		return "json"
	}
	return "text"
}

// Security emits a security event at the ERROR log level.
// The event is visible even with LOG_LEVEL=error and is distinguishable by the
// event=SECURITY attribute.
func Security(msg string, args ...any) {
	args = append([]any{"event", "SECURITY"}, args...)
	slog.Log(nil, LevelSecurity, msg, args...)
}
