package analysis

import (
	_ "embed"
	"log/slog"
)

//go:embed model/spam_model.dat
var embeddedSpamModel []byte

func init() {
	if err := LoadSpamModel(embeddedSpamModel); err != nil {
		slog.Warn("spam classifier: model not available", "error", err)
	}
}
